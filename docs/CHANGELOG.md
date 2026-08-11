# Changelog

All notable changes to this project are logged here, most recent first.
This file is updated every time we add or change something — treat it as the
source of truth for "what actually exists right now" vs. the Roadmap's "what's next."

## 2026-08-11 — Karvix didn't know its own name; add an in-app "what can I ask" screen

- **Real bug, found via live testing:** greeting the assistant by name
  ("Hi Karvix") got a confused/generic reply. Root cause: the product's
  rename to Karvix only ever touched branding surfaces (window title, tray,
  `package.json`) — the LLM's system prompt (`server/src/ws/session.ts`)
  still just said "You are a helpful voice assistant," never mentioning the
  name at all. Fixed: the prompt now says "You are Karvix" and explicitly
  tells the model to respond naturally when greeted by name, not as if asked
  about a third party.
- **New: an in-app "What can I ask?" screen**
  (`agent/src/renderer/components/HelpPanel.tsx`), opened from the header
  next to Settings. `docs/CAPABILITIES.md` lives in the repo, which an actual
  installed-app user never sees — this is the same content, written for an
  end user, inside the app itself. `ROADMAP.md`'s per-tool checklist now
  calls for updating both, not just the repo doc.
- Also fixed while touching `App.tsx`: `TOOL_LABELS` (used for the
  tool-activity chips) only had 3 of the 8 tools that exist today — every
  tool added since Phase 3 increment 1 forgot to add its label, so newer
  tools' chips showed a raw snake_case name instead of a real label.

## 2026-08-11 — Replace click-to-confirm popup with spoken yes/no

- **Changed based on real usage feedback:** `close_app`, `read_clipboard`,
  and `take_screenshot_and_describe` no longer gate on a client-side
  `dialog.showMessageBox` Allow/Deny popup — requiring a mouse click defeated
  the point of a voice-first assistant. Now the assistant asks out loud
  ("Close Chrome? Say yes to confirm.") and the *next* voice turn resolves
  it — a clear "yes" runs it for real, anything else (including silence or
  an unrelated reply) cancels it.
- This moved the whole mechanism server-side, into `Session`
  (`server/src/ws/session.ts`): a new `pendingConfirmation` field, a
  deterministic `classifyConfirmation` keyword match (unclear defaults to
  "no," same fail-safe the old dialog's `cancelId` already had), and
  `CONFIRMATION_PROMPTS` (`server/src/tools/schemas.ts`) as the server-side
  replacement for what each tool's `describe()` used to do. The `sensitivity`
  and `describe` fields are gone entirely from `ToolDefinition`
  (`agent/src/main/tools/types.ts`) and every tool file — the client no
  longer has any concept of "this one needs confirmation."
- The real constraint this had to respect: every `tool_calls` entry in an
  assistant message must be answered by a matching `tool`-role message
  before the next Groq call, so "pausing" still answers the call immediately
  with a placeholder, and the spoken question is injected as a separate,
  hand-written assistant message — deliberately not something asked of the
  model via another completion call, since real testing this session
  already showed Groq's tool-calling isn't reliable enough to trust with an
  "ask, don't call the tool again" instruction.
- Safety invariant preserved despite the speed-up: a sensitive tool call
  cannot execute without going through this state machine, no matter how a
  batch of tool calls is shaped — see `docs/ARCHITECTURE.md` "Confirmation
  for sensitive tools."
- **Not yet verified:** a real two-turn voice exchange on Windows (ask →
  confirm → runs; ask → decline → doesn't run).

## 2026-08-11 — Fix take_screenshot_and_describe's decommissioned vision model

- **Real bug, confirmed via live testing:** the vision model chosen at
  increment-4 ship time, `llama-3.2-11b-vision-preview`, had already been
  decommissioned by Groq (`model_decommissioned` — `console.groq.com/docs/deprecations`).
  Every screenshot request failed with a 502 from `/vision/describe`.
  Switched `server/src/vision.ts`'s `VISION_MODEL` constant to
  `qwen/qwen3.6-27b`, Groq's current production vision model per their
  vision docs. This is the second time Groq's vision-model lineup has
  changed within this project's short lifetime — worth treating the
  constant as needing a periodic check, not a one-time choice.
- Diagnosing this surfaced that the agent's dev workflow has a real gotcha
  worth remembering: `agent/`'s main process runs from `tsc -w`-compiled
  `dist/main/*.js`, and Electron does **not** hot-reload it — only the
  renderer has Vite HMR. A `git pull` alone, without fully killing and
  restarting `npm run dev`, silently keeps running stale main-process code
  with none of whatever was just fixed.

## 2026-08-04 — Fix zero-arg tool calls failing with a raw Zod error

- **Real bug, found via live testing:** `take_screenshot_and_describe` (and
  `read_clipboard` — any zero-argument tool) failed every time with
  `Expected object, received null`. Root cause: `llm.ts`'s `safeParseArgs`
  only caught JSON *parse* failures, but the model sometimes emits the
  literal string `"null"` for "no arguments," which `JSON.parse` accepts
  without throwing — so a bare `null` reached the client's
  `z.object({}).parse(null)` downstream and threw. Fixed by normalizing any
  non-object parsed result to `{}`.
- **Also fixed:** that error's raw Zod issue array (`[{"code":"invalid_type",...}]`)
  was leaking verbatim into the user-visible tool result — confirmed, not
  hypothetical, since it's exactly what surfaced from the bug above.
  `dispatchToolCall` (`agent/src/main/tools/index.ts`) now gives a plain
  fallback message for any `ZodError` instead of its raw `.message`.

## 2026-08-04 — Phase 3 increment 4: `take_screenshot_and_describe`

- **New tool: `take_screenshot_and_describe`.** Captures the primary display
  (Electron `desktopCapturer`, downscaled to ~1280px wide JPEG), sends it to
  a new `POST /vision/describe` endpoint, which calls Groq's
  `llama-3.2-11b-vision-preview` (`server/src/vision.ts`) and returns a text
  description — spoken back to the user like any other tool result. The
  third `sensitivity: "high"` tool, same Allow/Deny gate as `close_app`/
  `read_clipboard`.
- **Deliberately bypasses the WS `tool_call` protocol for the image itself**
  — every other tool's `ToolResult` gets persisted into the `ToolInvocation`
  audit table; a full screen capture durably stored in Postgres forever
  would be a real problem. The image travels only in the one HTTPS request
  to `/vision/describe`; only the resulting text ever becomes a `ToolResult`.
- Fixed a real gotcha this surfaced: `server/src/index.ts` had one global
  `express.json()` with the 100kb default, applied before any router saw the
  request — a base64 screenshot would 413 before a route-local limit could
  help. Scoped `/auth` to keep the small default and gave `/vision` its own
  25MB limit instead of raising the global one.
- `/vision/describe` reuses `checkAndConsumeTurn` (the same daily-cap check
  the WS turn loop uses) so a direct hit against the endpoint can't burn
  through the shared Groq key's quota unbounded.
- Consent screen updated: screenshots are the most sensitive thing shared so
  far (an actual image of your screen going to a cloud model), disclosed
  explicitly, always confirmed first.
- Wired through the same four sync points as every prior tool.
- **Not yet verified:** real screen capture, the HTTP round-trip, and an
  actual Groq vision response — this dev environment is Linux, needs a pass
  on the user's Windows machine.

## 2026-08-04 — Phase 3 increment 3: `read_clipboard`, plus a user-facing capabilities doc

- **New tool: `read_clipboard`.** Reads clipboard text via Electron's built-in
  `clipboard` module (no new dependency), truncated to 4,000 characters. The
  second `sensitivity: "high"` tool — gated by the existing Allow/Deny
  confirmation dialog, but for privacy (clipboard can hold passwords/OTPs),
  not destructiveness like `close_app`. Wired through the usual four sync
  points; consent screen copy generalized to cover both "risky" and
  "privacy-sensitive" confirm-first actions instead of only mentioning
  `close_app`.
- **New:** `docs/CAPABILITIES.md` — a living, plain-language summary of what
  Karvix can actually do today (as opposed to `ROADMAP.md`'s "what's next" or
  this file's dated history). Linked from `docs/README.md`. `ROADMAP.md`'s
  Phase 3 checklist now calls for updating it on every new tool.
- **Deliberately not built this pass:** `take_screenshot_and_describe`
  (needs a vision model + image transport + its own consent treatment — real
  architecture work) and `send_email_draft` (blocked on the user creating a
  Google Cloud OAuth client first, plus its own privacy review). Both need
  their own planning pass, not a rushed bundle with `read_clipboard`.

## 2026-08-04 — Phase 3 increment 2: `control_media` + `set_reminder`

- **New tool: `control_media`.** Play/pause, next/prev, volume, mute —
  simulated via `user32.dll`'s `keybd_event` (global, same as a physical
  multimedia key) through a fixed PowerShell `-Command`, not a native Node
  addon. Deliberately avoids repeating the `onnxruntime-node` prebuilt-binary
  pain from the memory feature.
- **New tool: `set_reminder`.** Relative-delay only (`delayMinutes`, e.g. "in
  10 minutes") — no timezone plumbing yet, so absolute times like "at 6pm"
  aren't supported this increment. Deliberately **client-local**: stored via
  `electron-store` (`agent/src/main/reminders/reminderStore.ts`) and fired by
  an in-process interval through Electron's native `Notification` API
  (`reminderScheduler.ts`) — no new Postgres table, no background poller or
  connection registry on the server. Overdue reminders catch up on next
  launch instead of being lost; known limitation is it only fires if the app
  is running at the time, and there's no cross-device sync yet.
- Wired both through the same four sync points as every prior tool (server
  `toolNames.ts`/`schemas.ts`, agent `toolContract.ts`/`deviceCapabilities.ts`).
- `ToolSchema.parameters.properties` gained an optional `enum` field (used by
  `control_media`'s `action` param) — a stricter JSON schema than a
  free-text description, which should reduce malformed tool-call generations
  for this tool specifically (see the ongoing `tool_use_failed` reliability
  note in `docs/ARCHITECTURE.md`).
- **Not yet verified:** real PowerShell execution and `Notification` behavior
  — this dev environment is Linux, needs a pass on the user's Windows machine.

## 2026-08-04 — Phase 3 increment 1: app control expansion (open + close)

- **`open_app` whitelist widened:** from 6 browser/editor entries to a curated
  list across browsers, editors, Office, media, communication apps (WhatsApp,
  Teams, Slack, Discord, Zoom), and system utilities (camera, file explorer,
  task manager, paint, settings, control panel, terminal, PowerShell). Moved
  into a new shared `agent/src/main/tools/appRegistry.ts` so `open_app` and
  the new `close_app` can't drift into two separate lists.
- **New tool: `close_app`.** Force-closes a whitelisted running app via
  `taskkill /IM <processName> /F` (fixed argv, same `execFile`-not-`exec()`
  rule as every other tool). File Explorer, Settings, and Control Panel are
  deliberately excluded — closing `explorer.exe` takes down the whole
  taskbar/desktop shell, not one window.
- **First real use of `sensitivity: "high"`:** that field sat inert since v1.
  `close_app` is now gated by an Allow/Deny `dialog.showMessageBox` confirmation
  in `dispatchToolCall` before it ever runs — `open_app` is unaffected, still
  immediate. Consent screen copy updated to disclose closing apps.
- Wired `close_app` through the four places that must stay in sync: server
  `toolNames.ts`/`schemas.ts`, agent `toolContract.ts`/`deviceCapabilities.ts`.
- **Not yet verified:** exact `start`/`taskkill` names for less-common apps
  (Slack, Zoom, Notepad++, etc.) — this dev environment is Linux, so real
  execution needs a pass on an actual Windows machine.

## 2026-08-04 — Named the product, fixed real bugs from live testing, shipped Phase 2 memory

- **Named:** the product is now **Karvix** (was the placeholder "Voice Agent").
  Wired through `package.json` (both packages), `electron-builder`'s
  appId/productName, window title, tray tooltip, HTML title, login screen. Also
  fixed `electron-builder.yml`'s GitHub Releases publish config, which still had
  placeholder owner/repo — auto-update would have pointed nowhere.
- **Real bugs found and fixed from actually running this on Windows** (all
  confirmed via live testing, not hypothetical):
  - `npm run dev` never launched Electron at all — only started Vite + `tsc -w`.
  - A CSP meant for the packaged app was blocking Vite's dev-mode inline script
    (React Fast Refresh), causing a blank page in dev.
  - Device tool capabilities were defined client-side but never actually sent to
    the server — every device's capabilities stayed at the default `[]`, so the
    LLM was never offered any tools at all, ever, silently.
  - A race in `MicCapture`: `ondataavailable`'s handler being `async` doesn't
    make the browser wait for it before firing `onstop` — `audio_end` could
    reach the server before an earlier chunk finished sending, corrupting the
    file Whisper received (`"could not process file"`).
  - The model would sometimes verbalize a tool call as literal text (e.g.
    `web_search(query: ...)`) instead of using the structured mechanism, and
    that raw pseudo-code got spoken to the user. Tightened the system prompt and
    added a sanitizer backstop.
  - `agent/tsconfig.json` had no include/exclude, so editors resolved it (not
    the per-target configs) for renderer files, merging Node and DOM globals
    into one program and producing real-looking editor-only type errors. Fixed
    via solution-style project references.
  - Editor-visible bug, same root cause class: connection drops mid-turn never
    reset `micState`, so the UI/mic button could get stuck indefinitely.
- **UI:** replaced the flat text screen with an animated central orb (tried CSS
  gradients first — still read as static; landed on a `<canvas>` particle ring,
  continuous motion in every state including idle), a clickable mic button
  (shares one `toggleMic()` with the hotkey so they can't disagree about
  recording state), tool-activity chips in the conversation (previously
  invisible), and auto-scroll to the latest message.
- **Phase 2 shipped** (see `ROADMAP.md`, `docs/ARCHITECTURE.md` "Memory /
  personalization"): durable conversation/message persistence, a
  server-handled `remember_preference` tool backed by local embeddings
  (`@xenova/transformers`) + Neon `pgvector`, and RAG-style memory retrieval
  folded into the system prompt each turn. Verified end-to-end: real embedding
  generation, real pgvector similarity search (correctly matched a relevant
  fact, correctly returned nothing for an unrelated query), the real Groq model
  actually choosing to call `remember_preference` for a durable-fact statement
  and *not* over-triggering on a one-off request, and the schema migration
  applied cleanly to the real Neon database.
- **Found in the process, not previously known:** Groq's Llama 3.3 has a real,
  non-trivial tool-call generation failure rate (confirmed via repeated testing,
  worse on compound requests) — added automatic retry, which measurably helps
  but doesn't fully eliminate it. Documented as a known limitation, not
  silently papered over.

## 2026-08-03 — v1 scaffold — Multi-tenant pivot + real implementation

**Correcting the record:** the previous entry below (dated the same day) described
a "v0.1 MVP" as done. It never was — no `server/` or `agent/` code existed, only
docs describing a single-user, no-auth, localhost-only design written ahead of any
implementation. That plan has been reconsidered and this entry describes what's
actually been built.

- **Decision:** this is a multi-tenant product from day one — real strangers will
  sign up and use it, not just the developer. That drove every architectural choice
  below.
- **Backend** (`server/`): Express + `ws` on one Fly.io-deployable Node process.
  Email/password auth with JWT access tokens + rotating refresh tokens, one-time
  WS-ticket handshake (keeps the long-lived JWT out of the WS URL). Prisma schema
  on Neon Postgres: `users`, `devices`, `refresh_tokens`, `usage_events`,
  `tool_invocations` (audit log, no transcript content). Per-connection `Session`
  with server-scoped `callId`s (cross-user tool-call leakage is structurally
  impossible, not just policy). Per-user daily Groq usage cap via Upstash Redis,
  with an optional BYOK (bring-your-own-key, AES-256-GCM encrypted) escape valve
  that lifts the cap. Groq Whisper STT + Llama 3.3 tool-calling loop, bounded to 6
  steps per turn.
- **Client** (`agent/`): Electron (contextIsolation + sandbox, no nodeIntegration).
  Login/signup screen, first-run consent screen (separate from the OS mic
  permission dialog), hotkey push-to-talk (`Ctrl+Shift+Space`), streamed opus mic
  capture, browser `SpeechSynthesis` TTS behind a swappable `TtsEngine` interface.
  Reconnect with exponential backoff + manual retry after 5 failed attempts. Tools
  implemented: `open_app` (fixed whitelist map), `web_search`, `open_url`
  (http/https-only scheme validation) — every tool call guarantees a `tool_result`
  even on timeout/throw, so the server's loop never hangs.
- Packaging: `electron-builder` (NSIS) + `electron-updater` via GitHub Releases.
- Both `server/` and `agent/` typecheck and build cleanly (`tsc --noEmit`, `vite
  build`); not yet run end-to-end against real Neon/Upstash/Groq credentials or
  packaged for distribution.
- **Not yet done:** persisted memory/personalization, more tools, better TTS,
  wake-word, task queue, mobile client, Stripe/billing, real Neon/Upstash/Fly
  deployment, code signing, privacy policy/ToS, monitoring (Sentry/uptime).

## 2026-08-03 — v0.1 (superseded, see above) — Initial MVP scaffold
- ~~Project structure created: `server/` (backend brain) + `agent/` (Electron
  hands).~~ *(Never actually created — see the correction above.)*
