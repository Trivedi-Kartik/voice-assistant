# System Audit (Phase 0)

Companion to `CURRENT_ARCHITECTURE.md`. This document judges what exists, not what should exist (`TARGET_ARCHITECTURE.md`).

## 1. What is already good and should remain

- **Security posture of auth is genuinely solid**: bcrypt hashing, refresh-token rotation with real reuse/theft detection (not just documented intent — verified in `refreshTokens.ts:29-50`), refresh tokens stored only as SHA-256 hashes, WS identity bound once at handshake and never trusted from later client messages, BYOK keys encrypted at rest (AES-256-GCM), refresh token on disk encrypted via OS-level `safeStorage`, access token never persisted or exposed to the renderer. This should not be touched casually in any future refactor.
- **The confirmation state machine's core lesson is already learned and correctly generalized**: never leave a `tool_calls`/`tool` message pair open across a turn boundary; always mint a fresh, self-contained pair on resolution. This was a real, shipped bug once (infinite re-ask loop) and the fix has already been correctly reused for the newer, more complex `computer_use_task` risk-gate pause — a good sign the lesson is durable, not just patched once.
- **`TriggerSource` abstraction** (`hotkey/triggerSource.ts`) already exists as a clean seam for wake-word later — nothing about the renderer, WS protocol, or tool execution needs to change when that ships, only a second implementation of one two-method interface.
- **`TtsEngine` abstraction** (`audio/ttsPlayback.ts`) is the same pattern for a future Piper/ElevenLabs swap — already proven useful once (Linux native fallback is a second real implementation of the same interface, not a special case bolted on).
- **Platform-specific code is consistently split into `.win.ts`/`.linux.ts` pairs behind one dispatcher**, never inline `if (platform)` branches scattered through shared logic. Easy to extend to a third platform later without touching the dispatcher's callers.
- **The whitelist-only tool model, and its narrower rule that free text is never fed into a shell command** (custom-app resolution always goes through an OS enumeration or a native file picker, never raw user-typed strings) — this is the single most load-bearing safety property in the whole system and it holds up under inspection, not just under the comments describing it.
- **Fire-and-forget persistence is consistently non-blocking**: every "durable copy" write (Postgres message append, usage event, `AutomationStep` audit row) is wrapped in `.catch()` and never allowed to block or fail the actual user-facing turn. This is a deliberate, consistently-applied pattern, not an accident.
- **The daily-cap / BYOK cost model** is a genuinely working, zero-billing-infrastructure-required pressure valve — exactly the kind of "free-first" design the target architecture asks for, already shipped.

## 2. What is tightly coupled

- **`ws/session.ts` is a ~610-line god-object.** It owns: turn orchestration, STT invocation, memory retrieval, system-prompt construction, the tool-calling loop, three distinct confirmation state machines (generic tool gate, automation-start gate, automation-risk-step gate), rate-limit/lock acquisition, and Redis/Postgres persistence. Any future "agent kernel" or "task engine" (master doc §6-7) cannot be bolted alongside this file — it has to be extracted *from* it. This is the single biggest structural blocker to Phase 1 (agent kernel) and should be treated as the primary refactor target, not left as-is indefinitely.
- **The tool-calling loop is hardcoded to exactly one LLM call shape** (`llm.ts`'s `runLlmStep`, a single non-streaming Groq chat-completion call with `tools`/`tool_choice:"auto"`). There is no seam between "ask a model for the next step" and "the model is specifically Groq's chat-completions API" — a model router (master doc §4.3) cannot be introduced without touching this exact call site and its two callers (the main loop, and `automation/vision.ts`'s separate, differently-shaped vision call).
- **Client tool dispatch and the LLM's tool schema are two hand-maintained mirrors** (`server/src/tools/toolNames.ts` / `agent/src/shared/toolContract.ts`), kept honest only by a boot-time equality assertion on each side. Any new client tool requires editing 4 files by hand in lockstep (schema, confirmation prompt if gated, agent tool file, agent registry entry) — workable at 9 tools, will not scale cleanly to a real skill system (master doc §22) with dozens of tools across categories.
- **The renderer's Zustand store and the main process's IPC surface are 1:1 hand-wired** — every new capability (continuous conversation, automation panel) has required touching `ipcHandlers.ts`, `preload/index.ts`, `jarvis.d.ts`, and `App.tsx` in the same shape each time. Workable, but it's boilerplate that will grow linearly with every future capability unless a typed IPC contract generator or a thinner event-bus pattern is introduced.

## 3. What is fragile

- **Computer-use automation (`automation/`) is the newest, least-battle-tested subsystem in the codebase**, and it has already produced multiple real bugs found only via live testing in the current session: a coordinate-scaling bug (screenshot resized for the vision model, but click coordinates were never scaled back to the real screen — clicks landed near the top-left of any screen wider than the resize target), a stale-closure bug (hotkey couldn't actually cancel a running task), a vision-model-name 404 (Groq's docs listed a model this account didn't actually have access to), and a double-confirmation UX bug (the LLM asking its own "should I proceed?" in prose on top of the system's own confirmation). None of these were caught by any automated check — all were found by a human actually running it. This subsystem has the highest bug-discovery rate of anything in the codebase so far and should be treated as unstable, not production-hardened, regardless of whether it currently "works."
- **The free vision model is an accepted-but-real accuracy ceiling**, not a bug: `qwen/qwen3.8-27b` deciding pixel-precise click coordinates from a downscaled screenshot will misclick some real, non-trivial fraction of the time. This is disclosed to users but has no automated success-rate measurement at all (see `RISK_REGISTER.md`).
- **Groq's model catalog has already changed out from under this codebase three separate times** (chat model: Llama 3.3 → `openai/gpt-oss-120b`; vision model: `llama-3.2-11b-vision-preview` → `qwen/qwen3.6-27b` → `qwen/qwen3.8-27b`, the last swap fixed live in production earlier in this same engagement, shortly before this Phase 0 audit began — not during the audit's own research, which only read/verified the fix already in place). Every one of these was an unplanned emergency fix, not a scheduled migration. Any model name hardcoded as a bare string constant is a live production outage waiting to happen again.
- **The per-user concurrency lock is in-memory, not Redis-backed** (`ws/userLock.ts`) — correct today because the server runs as exactly one process, but silently stops providing any real protection the moment a second instance/process is ever added (autoscaling, a second Render instance, a restart race), with no error or warning if that assumption is violated.
- **`recordUsage()` is called every turn with an empty delta** (`{}`) — the `UsageEvent` table's `groqSttSeconds`/`groqTokensIn`/`groqTokensOut` columns exist and are queried nowhere, but are also never actually populated by any real call site found. Only `turnCount` increments meaningfully. Cost-tracking is partially wired, not fully — a real gap between what the schema promises and what the code delivers.
- **The renderer's `turns` array (conversation transcript) grows unbounded for the life of the window** — no cap, no virtualization. Not yet a problem at typical usage, but a real long-session memory/perf risk with no test or guard against it.

## 4. What is duplicated

- Tool name list: `server/src/tools/toolNames.ts` and `agent/src/shared/toolContract.ts` (identical arrays, hand-synced).
- Language list: `server/src/i18n/languages.ts` and `agent/src/renderer/i18n/languages.ts` (identical 8-code arrays, hand-synced).
- Protocol message shapes: `server/src/protocol.ts` and `agent/src/shared/protocol.ts` (identical `ClientMessage`/`ServerMessage`/`ToolResult`/`AutomationAction` unions, hand-synced — this one has grown the most since the original 3-name justification for not sharing a module).
- Screenshot-description and computer-use decision-making both re-implement "call a Groq vision model with an image_url content block" independently (`vision.ts`'s `describeImage` and `automation/vision.ts`'s `decideNextAction`) with separately-declared model constants that must be kept in sync by comment cross-reference, not code.

## 5. What is platform-specific

Genuinely necessary and already well-isolated: `appExec.*`, `appRegistry.*`, `addCustomApp.*`, `controlMedia.ts` (Windows-only, no Linux equivalent exists), `inputSim.*` (Windows PowerShell/SendKeys vs. Linux xdotool, with Wayland explicitly unsupported), `nativeTts.ts` (Linux-only). All correctly gated by `process.platform` checks at the dispatcher layer, never leaking into shared logic. macOS has **zero** support anywhere in the codebase (no `.mac.ts` files exist for any of these, no macOS packaging target) — this is a real gap if macOS users are ever in scope, not currently tracked as a limitation anywhere in the docs.

## 6. What is difficult to test

Everything, structurally, because **nothing is tested today** — zero test files exist in the repository. Specifically hard to test even if tests were added right now, without further refactoring:
- `ws/session.ts`'s god-object shape (§2) means unit-testing the tool-calling loop in isolation from STT/memory/persistence is not currently possible without extensive mocking of Groq, Redis, and Postgres simultaneously.
- Anything touching real OS input simulation, real screen capture, or real global hotkeys cannot be meaningfully unit-tested at all — it requires a real display/mic/input device, which is exactly why every "real bug" in `CHANGELOG.md` was found by a human manually running the app, not by any automated check.
- The three-turn confirmation state machines (generic gate, automation-start gate, automation-risk-step gate) are exactly the kind of stateful, multi-turn logic that's cheap to get subtly wrong and expensive to verify by hand each time — a strong candidate for the first real unit tests, since they're pure state-transition logic with no OS/network dependency once the LLM/WS boundary is mocked.

## 7. What will block multi-step agent execution (master doc Phase 1)

The tool-calling loop today is a single bounded `for` loop inside `runTurn()` with a hardcoded step cap (6) and no persisted notion of a "task" independent of a WS connection's lifetime. There is no `Task`/`TaskStep` entity, no plan representation, no checkpointing, no resumability across a disconnect (history resumes via Redis cache, but an in-flight multi-step *plan* does not survive a reconnect — only completed turns do). Building a real task engine requires extracting planning/execution/verification out of `Session` into something that persists independently of the WS connection object.

## 8. What will block browser/computer use (master doc Phase 4-5)

Computer-use (screenshot + coordinate click) already exists and works end-to-end, but it is the master doc's own explicitly-named *fallback* tier (§8, Level 5), not the preferred tier. **There is currently no Level 2-4 tooling at all** — no DOM/accessibility-tree access, no Playwright, no structured browser session manager. `web_search`/`open_url` only ever open a tab in the user's default browser and never read anything back — meaning today's system cannot verify a browser task's outcome at all, structurally, regardless of which execution tier is used. Any browser-agent phase starts from zero, not from an upgrade path.

## 9. What will block local-model support (master doc Phase 3)

Every model-calling call site (`llm.ts`, `stt.ts`, `vision.ts`, `automation/vision.ts`) constructs its own `Groq` client directly and calls Groq's SDK methods inline — there is no `ModelRouter`/adapter interface anywhere to swap an implementation behind. Local inference also has a real, unaddressed hardware question the current codebase has never had to answer: the whole product runs today on remote GPU inference; running a `27B`-class model locally inside an Electron app has real RAM/VRAM requirements this audit has no evidence the target user's hardware supports. This is a product-fit question, not just an engineering one — see `RISK_REGISTER.md`.

## 10. What will block cross-device support (master doc Phase 10)

Device identity/capability reporting already exists (`Device` table, `deviceCapabilities.ts`, capability-filtered tool schemas) — this is a real head start. What's missing entirely: any notion of a task being *initiated* on one device and *executed* on another (today a `Session`/`Task` doesn't exist independently of one specific WS connection at all), and any device-to-device signaling path (no LAN discovery, no relay).

## 11. Security problems found

- No rate limiting on `/auth/signup`/`/auth/login` — a real credential-stuffing/brute-force exposure, already self-acknowledged in `docs/ARCHITECTURE.md` as a known, deferred gap. Not yet exploited as far as this audit can tell, but not mitigated either.
- No account lockout after repeated failed logins.
- No password-reset flow — a user who forgets their password has no self-service recovery path at all today.
- Access tokens are unrevocable stateless JWTs — a stolen access token remains valid for its full TTL (15 min) even after logout.
- No code signing on the Windows installer (accepted, documented, appropriate for the current invited-testers phase — but a real gap before any broader distribution).
- The in-memory-only `userLock` (§3) is a latent security/correctness gap specifically *if* horizontal scaling is ever added without also moving this lock to Redis.

## 12. What should be refactored vs. replaced

**Refactor (extract, don't rewrite):**
- `ws/session.ts` → split into a thin connection/protocol handler + an extracted turn/task orchestrator that doesn't know about WS at all. This is the prerequisite for Phase 1 and should happen as a behavior-preserving refactor with the existing (informal, live-tested) behavior as the regression bar, since no automated tests exist yet to pin it down first.
- Direct `Groq` SDK construction at each call site → a single `ModelRouter`/provider-adapter interface, with the *existing* Groq calls becoming the first (and for now, only) adapter. This should be a pure interface-extraction with zero behavior change, done before any real local-model work is attempted, so local inference becomes additive later rather than a rewrite.
- Hand-duplicated cross-package contracts (tool names, language list, protocol shapes) → worth a shared-package/workspace boundary eventually, but this is not urgent (the boot-time assertions currently catch drift reliably) and should not be prioritized over the two refactors above.

**Replace later, not now:**
- Computer-use as the *only* browser-task execution path → a proper Playwright-based browser runtime should be added as a new, preferred tier for web tasks, with computer-use demoted to its correct role (fallback for apps with no browser/API/DOM interface) once it exists. This directly addresses the original product motivation for computer-use (an Amazon-style task) with a far more reliable mechanism than screenshot-clicking.

**Do not touch without a very concrete reason:**
- The auth system's cryptographic choices and token-rotation logic (§1) — already correct, low-value to "improve" without a specific finding driving it.

## 13. Verification performed for this audit

Both packages' `typecheck` and `build` scripts were run fresh, directly, during this audit (2026-09-19) and passed cleanly with no errors:
```
server:  npm run typecheck  → tsc --noEmit  → clean
server:  npm run build      → tsc -p tsconfig.json → clean
agent:   npm run typecheck  → tsc (main) --noEmit && tsc (renderer) --noEmit → clean
agent:   npm run build      → vite build (renderer) + tsc (main) → clean
```
No test suite exists to run (`npm test` is not a defined script in either package — confirmed by reading both `package.json` files in full, not inferred). This is the actual current verification ceiling: a clean typecheck/build is evidence the code compiles, not evidence any behavior is correct.
