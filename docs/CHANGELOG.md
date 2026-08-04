# Changelog

All notable changes to this project are logged here, most recent first.
This file is updated every time we add or change something — treat it as the
source of truth for "what actually exists right now" vs. the Roadmap's "what's next."

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
