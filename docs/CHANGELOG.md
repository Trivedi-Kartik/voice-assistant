# Changelog

All notable changes to this project are logged here, most recent first.
This file is updated every time we add or change something — treat it as the
source of truth for "what actually exists right now" vs. the Roadmap's "what's next."

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
