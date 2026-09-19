# Current Architecture (as of 2026-09-19)

Phase 0 deliverable. This is a factual "as-is" description of the running system, produced by reading the actual code (not `KARVIX_2_MASTER_BUILD_DOCUMENTATION.md`'s target design — see `TARGET_ARCHITECTURE.md` for that). Every claim below was verified against source; file:line citations are given where precision matters.

## 1. Repository shape

Two **independent npm packages**, no monorepo/workspaces tooling:

```
ai-bot/
├── server/    — Node/TS backend (Express + ws), deployed to Render
├── agent/     — Electron desktop client (Windows nsis + Linux AppImage)
├── render.yaml, ROADMAP.md
└── docs/
```

Confirmed directly: no root `package.json`, no `workspaces` field in either package, `agent/node_modules` and `server/node_modules` are separate real directories (not symlinked). Everything shared between them (tool name lists, language lists, protocol message shapes) is **hand-duplicated in both packages** and kept in sync by a boot-time assertion (`assertSchemasMatchContract()` in `server/src/tools/schemas.ts`) rather than a shared module. This is a deliberate choice (comment: "server ships as a Docker image with no `agent/` source in it... overkill for 3 string literals"), not an oversight — but it is now duplicated across more than 3 things (tool names, language list, protocol types, `ToolResult`/`AutomationAction` shapes).

No test files exist anywhere in the repository. No CI workflow exists. No lint config exists (source has `eslint-disable-next-line` comments referencing a linter that isn't configured anywhere). Both packages have a `typecheck` script (`tsc --noEmit`) and both pass cleanly as of this audit (verified by running them directly, see `SYSTEM_AUDIT.md` §Verification).

## 2. Server (`server/`)

Express (HTTP) + `ws` (WebSocket), one long-lived Node process, Postgres (Neon, pgvector extension) via Prisma, Redis (Upstash) via `ioredis`, deployed as a single Docker container on Render (`render.yaml`, `Dockerfile`).

### 2.1 Auth
- `POST /auth/signup`, `/auth/login` (`auth/routes.ts`): bcryptjs-hashed passwords (cost factor 10, deliberately lowered from 12 for latency), issue a short-lived JWT access token (`auth/jwt.ts`, HS256, default 900s TTL) + a rotating refresh token (`auth/refreshTokens.ts`).
- Refresh tokens: only their SHA-256 hash is ever stored (`crypto.ts:sha256Hex`); rotation on every use; **reuse of an already-rotated/revoked token revokes the entire `(userId, deviceId)` chain** — real theft detection, not aspirational (`refreshTokens.ts:29-50`).
- WS handshake: `POST /auth/ws-ticket` (bearer-authed) issues a random, single-use, 30-second Redis-backed ticket (`auth/wsTicket.ts`) — kept out of the WS URL's *long-lived* JWT specifically so a proxy/access log leak can't replay a session; the ticket itself is still a query param but is single-use and short-lived. `ws/server.ts` consumes the ticket, re-checks `Device.revokedAt`, and binds `{userId, deviceId}` to the `Session` for the connection's lifetime — no later client message is ever trusted to carry identity.
- Gaps (confirmed absent by grep, and explicitly acknowledged in `docs/ARCHITECTURE.md`): no rate limiting on `/auth/*`, no account lockout, no password-reset flow, no email verification. Access tokens have no revocation list (logout only kills refresh tokens; a leaked access token is valid until its own 15-minute TTL expires).

### 2.2 Realtime voice/tool loop (`ws/session.ts`, ~610 lines — the largest, most central file in the codebase)
One `Session` object per WS connection. Per turn (`audio_end` → `runTurn()`):
1. Concatenate buffered `audio_chunk`s → `transcribeAudio()` (Groq Whisper, language forced from the user's stored preference, not auto-detected).
2. Resolve any `pendingConfirmation` from the previous turn (yes/no keyword classification, `i18n/confirmation.ts`) *before* treating the new transcript as a fresh request.
3. Retrieve up to 5 relevant `MemoryFact`s (pgvector cosine distance < 0.8) and fold them into a rebuilt system prompt.
4. Tool-calling loop against Groq (`llm.ts`, currently `openai/gpt-oss-120b`), bounded at `MAX_TOOL_LOOP_STEPS = 6`. Each tool call is either: **client-executed** (round-trips over the WS as `tool_call`/`tool_result`, logged to `ToolInvocation`), **server-executed** (`remember_preference`, resolves in-process), or **gated** (`CONFIRMATION_PROMPTS` — pauses, asks a deterministic spoken question, resolves on the *next* turn via a freshly-minted `tool_calls`/`tool` message pair, never a reused call id).
5. `computer_use_task` (added 2026-09) is a fourth category: a bounded, multi-turn sub-loop (`automation/runner.ts`) that can itself pause mid-task for a second, action-specific confirmation before a high-risk step — see §2.4.
6. Working history is cached in Redis (1h TTL) per turn; durable copies land in Postgres (`Conversation`/`Message`) best-effort, non-blocking.

Per-user serialization: an in-memory (not Redis-backed) `Set` (`ws/userLock.ts`) rejects a second concurrent turn from the same user outright (no queueing) — protects shared Groq quota and history-append ordering, but provides **zero protection if the server ever runs as more than one process/instance**.

### 2.3 Tools (client-executed, 9 total)
`open_app`, `close_app` (gated), `web_search`, `open_url`, `control_media` (Windows-only), `set_reminder`, `read_clipboard` (gated), `take_screenshot_and_describe` (gated), `add_custom_app` (gated). Schemas live in `server/src/tools/schemas.ts`; names are mirrored by hand in `agent/src/shared/toolContract.ts` and cross-checked at boot on both sides. No tool ever feeds untrusted external text (a webpage body, an email) into the LLM's context — `web_search`/`open_url` only open a browser tab; this is the stated reason prompt-injection defense hasn't been built yet ("closes the vector by scope").

### 2.4 Computer-use automation (`automation/`, added 2026-09 — the newest, least-tested subsystem)
A 10th "tool," `computer_use_task(goal)`, kept structurally separate from the 9 above because its execution isn't a single request/response — it's a bounded (15 steps / 3 min) loop: screenshot → Groq vision model (`qwen/qwen3.8-27b`) decides one `{type, x, y, text, key, risk, reasoning}` action → client executes it (PowerShell/`SendKeys` on Windows, `xdotool` on Linux X11 only — Wayland explicitly detected and refused, not silently attempted) → new screenshot → repeat. A `risk:"high"` decision pauses the whole loop for its own spoken confirmation, reusing the session's confirmation machinery but as a *second*, independent pending-state (`pendingAutomationConfirm`, distinct from the tool-start gate). Executed steps are logged to `AutomationStep` (never screenshot bytes). See `SYSTEM_AUDIT.md` for why this is the most fragile part of the system.

### 2.5 Memory (`memory/`)
Local, in-process embeddings via `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`, 384-dim), loaded via a **dynamic** import specifically because the transitive native dependency (`onnxruntime-node`) has failed to load on at least one real Windows machine — a static import would have crashed the entire server on that failure, not just memory. Model weights are downloaded at runtime on first use and cached on disk (not vendored). pgvector column can't be typed by Prisma (`Unsupported("vector(384)")`), so all reads/writes are raw SQL. Writes happen **only** via the explicit `remember_preference` tool call — no passive/background scanning exists anywhere.

### 2.6 Cost control
Shared Groq key: Redis daily counter (`DAILY_TURN_CAP`, default 25/day), checked before STT is even attempted. BYOK (`User.groqApiKeyEnc`, AES-256-GCM): bypasses the counter entirely — unlimited turns from this app's perspective, cost absorbed by the user's own Groq account. No billing system exists (`User.plan` field present but unused).

## 3. Agent (`agent/`) — Electron desktop client

Three processes per the standard Electron split: **main** (Node, all OS/tool access), **preload** (the only bridge — `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), **renderer** (React 18 + Zustand, zero direct Node/Electron API access).

### 3.1 Voice capture → playback pipeline
Renderer `MediaRecorder` (`audio/micCapture.ts`) streams 250ms `audio/webm;codecs=opus` chunks over IPC as captured (not record-then-send, for lower tail latency); a `sendChain` promise chain guarantees chunks are fully sent, in order, before `audio_end` fires (fixing a real, previously-shipped race). Continuous conversation (2026-09, now unconditional/always-on): `SilenceDetector` (RMS-based VAD on the same `MediaStream`, never a second `getUserMedia`) auto-stops an utterance after speech-then-silence, and the app auto-resumes listening after each reply, bounded by a 30s hard inactivity timeout that fully releases the mic. TTS: browser `SpeechSynthesis` everywhere except Linux, which gets a native `spd-say` (espeak-ng backend) shell-out via IPC, because Chromium ships no real TTS backend on Linux at all (confirmed live: silent no-op).

### 3.2 Trigger sources
A `TriggerSource` interface (`start(onPress)`/`stop()`) already abstracts "what starts a turn" — `HotkeyTriggerSource` (Electron `globalShortcut`, fixed `Ctrl/Cmd+Shift+Space`) is the only implemented one. `WakeWordTriggerSource` exists as a deliberate, documented stub (`throw new Error(...)`) for a deferred v2 wake-word feature — the abstraction is already in place for it, nothing there needs rework when that phase starts.

### 3.3 Tool execution (main process, `tools/`)
One file per tool, dispatched via a `Record<string, ToolDefinition>` registry cross-checked against the shared name contract at boot. Everything platform-specific is split into `.win.ts`/`.linux.ts` pairs behind a common dispatcher (`appExec.ts`, `appRegistry.ts`, `addCustomApp.ts`). Custom app registration never accepts free text into a command: Windows resolves against `Get-StartApps` (covers UWP/Store apps too) or a native file picker; Linux resolves against parsed `.desktop` files or a native binary picker; both platforms enforce a fixed denylist of dangerous system binaries regardless of match source. Everything is confirmation-gated server-side, not client-side — by the time a tool's `execute()` runs, consent already happened.

### 3.4 Persistence (all client-local, `electron-store` unless noted)
Consent acceptance, custom apps, reminders, device id — all local-only, never synced, never visible to any other device or user. The refresh token is the one exception stored differently: encrypted via Electron's OS-level `safeStorage` (DPAPI on Windows) into a flat file, not `electron-store`. The access token lives in main-process memory only, never touches disk, never crosses into the renderer.

### 3.5 Packaging
`electron-builder`: Windows → NSIS installer (no code signing — accepted for the current invited-testers phase, documented). Linux → AppImage only, with a real, structural, **documented-not-fixed** limitation: Chromium's sandbox needs a root-owned setuid helper that an AppImage's per-run extraction can never provide; testers must launch from a terminal with `--no-sandbox`. Auto-update via `electron-updater` against GitHub Releases, deliberately deferred (polls every 30s) until no conversation is active before ever prompting a restart.

## 4. Execution flow traces

### 4.1 Voice request, end to end
```
mic press (hotkey or button)
  → renderer MediaRecorder starts, streams webm/opus chunks over IPC (250ms)
  → main forwards each chunk over WS as {type:"audio_chunk"}
  → SilenceDetector or manual press triggers stop → {type:"audio_end"}
  → server: Session.runTurn() — concatenate buffer, resolve pending confirmation if any,
    transcribeAudio() [Groq Whisper, forced language]
  → {type:"transcript"} sent back, pushed into history
  → findRelevantMemories() [pgvector], system prompt rebuilt
  → tool-calling loop against Groq (openai/gpt-oss-120b), up to 6 steps
  → no tool calls → sanitizeAssistantText() → {type:"assistant_text"}
  → renderer: pushTurn(), setMicState("speaking"), TtsEngine.speak()
  → (continuous mode) on TTS end, if session still active, resume listening automatically
```

### 4.2 Tool task, end to end (e.g. "close Chrome")
```
LLM emits a tool_call for close_app
  → CONFIRMATION_PROMPTS has an entry for close_app → NOT executed yet
  → server pushes a placeholder tool result, sets pendingConfirmation, speaks
    the deterministic confirmation question, ends the turn
  → next turn's transcript classified yes/no (i18n/confirmation.ts)
  → "yes": a brand-new tool_calls/tool message pair is minted (never reuses the
    old call id — this was a real, previously-shipped bug) →
    dispatchToolCall() sends {type:"tool_call"} over WS
  → agent main process: REGISTRY lookup → closeAppTool.execute() →
    platform-specific taskkill/pkill → {type:"tool_result"} sent back
  → server appends the ToolResult to history, resumes the tool loop so the
    model can react to it in plain language
```

## 5. Deployment topology

- **Server**: single Docker container on Render (free tier), Neon Postgres (pgvector), Upstash Redis. `render.yaml` defines the blueprint. Free-tier traits accepted as known behavior: idle-service cold start (~1-2s first message after 15min quiet), Neon's own serverless-compute wake-up on a long-idle database.
- **Agent**: no server-side hosting — distributed as a GitHub Release artifact (NSIS/AppImage), auto-updates from there.
- No CI/CD pipeline exists — deploys are `git push` (Render auto-deploy) for the server, and a manual local `npm run package` for the agent.
