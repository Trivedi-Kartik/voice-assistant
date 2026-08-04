# Voice Agent — Multi-Tenant Personal Assistant

A real, shippable voice assistant — talk to it, it talks back, and it can actually
control your machine (open apps, search the web) via a strict, whitelisted tool
system. This is a real product multiple people sign up and use, not a demo — see
`docs/ARCHITECTURE.md` for the full design and `ROADMAP.md` for what's next.

> **Note on history:** an earlier version of these docs described a single-user,
> no-auth, localhost-only MVP as if it were already built. It never was — no code
> existed. This is the actual v1 design and implementation: multi-tenant from day
> one (accounts, hosted backend, per-user isolation), because real strangers will
> use this, not just the developer. See `docs/CHANGELOG.md` for the full story.

## How it works (one line)

You press a hotkey and speak → Electron client streams audio to your account's
session on a hosted backend → the backend transcribes it (Groq Whisper) → an LLM
(Groq Llama 3.3) decides whether to just reply, or call a **tool** (open an app /
search the web / open a URL) → if it's a tool call, the Electron client (which has
real OS access) executes it → result goes back to the LLM → final spoken reply
comes back to you.

```
 [You speak]
      │
      ▼
 Electron Client (Windows) — login, hotkey, mic capture, TTS, tool execution
      │  wss:// (authenticated per-user)
      ▼
 Node/TS Backend on Fly.io — auth, per-user session, Groq STT + tool-calling LLM
      │                              │
      ▼                              ▼
 Neon Postgres (accounts,      Upstash Redis (ephemeral session
 devices, usage log)           buffer, per-user rate-limit counters)
      │
      ▼
 Groq API (Whisper STT + Llama 3.3)
```

## Project layout

```
voice-agent/
├── docs/                 ← architecture, setup, changelog (this file)
├── ROADMAP.md            ← what's next, ordered by value
├── server/               ← the "brain" — multi-tenant Node/TS backend
│   ├── prisma/schema.prisma   accounts, devices, refresh tokens, usage log
│   └── src/
│       ├── auth/               signup/login/refresh/ws-ticket, JWT + rotation
│       ├── ws/                 per-connection Session, tool-calling loop
│       ├── tools/schemas.ts    tool schemas offered to the LLM
│       ├── stt.ts / llm.ts     Groq Whisper + Llama 3.3 tool-calling
│       └── rateLimit.ts        shared-key daily cap + BYOK bypass
└── agent/                ← the "hands" — Electron app (Windows)
    └── src/
        ├── main/            auth, WS connection, hotkey, tool execution, tray
        ├── preload/         the only bridge into the renderer
        ├── renderer/         UI: login, consent, conversation, settings
        └── shared/           WS protocol + tool-name contract
```

## Quick start (local dev)

**Prerequisites:** Node.js 20+, a free [Groq API key](https://console.groq.com), a
[Neon](https://neon.tech) Postgres database, and an [Upstash](https://upstash.com)
Redis database (both have free tiers).

### 1. Backend
```bash
cd server
npm install
cp .env.example .env
# fill in GROQ_API_KEY, DATABASE_URL, REDIS_URL, JWT_SECRET, BYOK_ENCRYPTION_KEY
npx prisma migrate dev
npm run dev
```

### 2. Client — in a second terminal
```bash
cd agent
npm install
cp .env.example .env   # points at the local backend by default
npm run dev
```
Sign up with an email/password, accept the consent screen, then press
**Ctrl+Shift+Space** and try: *"Open Chrome and search best pizza in Ahmedabad."*

## Full docs

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — auth, data model, session isolation, security rules
- [`docs/SETUP.md`](SETUP.md) — detailed setup, troubleshooting, packaging
- [`ROADMAP.md`](../ROADMAP.md) — what's next (memory, more tools, wake-word, mobile)
- [`docs/CHANGELOG.md`](CHANGELOG.md) — dated log of what's actually been built
