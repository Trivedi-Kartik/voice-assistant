# Setup Guide

## 1. Prerequisites

- Node.js 20+ (`node -v`)
- A free [Groq API key](https://console.groq.com/keys)
- A free [Neon](https://neon.tech) Postgres database (pooled connection string)
- A free [Upstash](https://upstash.com) Redis database
- Windows 10/11 for running the client (tool implementations in
  `agent/src/main/tools/` are Windows-specific in v1)

## 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Fill in `.env`:
```
GROQ_API_KEY=your_groq_key
DATABASE_URL=postgresql://...   # Neon pooled connection string
REDIS_URL=rediss://...          # Upstash Redis URL
JWT_SECRET=some_long_random_string
BYOK_ENCRYPTION_KEY=            # base64-encoded 32 random bytes, see below
DAILY_TURN_CAP=25
```

Generate `BYOK_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run the database migration, then start the server:
```bash
npx prisma migrate dev
npm run dev
```
You should see `[server] listening on :8080 (HTTP + WS on /ws)`. Keep this running.

## 3. Client setup (new terminal)

```bash
cd agent
npm install
cp .env.example .env   # defaults to the local backend — fine for dev
npm run dev
```

An Electron window opens. Accept the consent screen, sign up with any
email/password (this hits your local backend), then either press
**Ctrl+Shift+Space** or click the mic button to start/stop recording — both
trigger the exact same toggle, so they can't get out of sync with each other.
Try: *"Open Chrome and search top JavaScript frameworks 2026."*

## 4. Packaging the client for distribution

```bash
cd agent
npm run package
```
Produces a signed-or-not NSIS installer in `agent/release/` via `electron-builder`
(see `electron-builder.yml`). Auto-update checks GitHub Releases
(`electron-updater`) — point `publish.owner`/`publish.repo` at your actual repo
before shipping. Without a code-signing certificate, Windows SmartScreen will warn
on first run; acceptable for early/invited users, revisit before a broader launch.

## 5. Deploying the backend

```bash
cd server
fly launch    # first time only — creates the Fly app from fly.toml
fly secrets set GROQ_API_KEY=... DATABASE_URL=... REDIS_URL=... JWT_SECRET=... BYOK_ENCRYPTION_KEY=...
fly deploy
```
Then point the packaged client's `.env` (`SERVER_WS_URL`/`SERVER_HTTP_URL`) at your
`https://your-app.fly.dev` domain before building the installer for real users.

## Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| Electron window stuck on "Connecting…" | Backend isn't running, or `.env`'s `SERVER_HTTP_URL`/`SERVER_WS_URL` don't match where it's actually running. |
| Signup/login fails immediately | Check `DATABASE_URL` is reachable and `npx prisma migrate dev` has been run. |
| "You've hit today's free limit" right away | `DAILY_TURN_CAP` may be set too low for testing, or Redis wasn't cleared between test runs — bump the cap in `.env` for local dev. |
| No transcript after speaking | Check `GROQ_API_KEY` is valid in `server/.env` and check the server terminal for errors. |
| "Open Chrome" does nothing | The app name isn't in the whitelist — see `agent/src/main/tools/appRegistry.ts`. |
| No sound on reply | Check Windows isn't blocking audio permissions/output device for Electron. |
| Mic not captured | Windows Settings → Privacy → Microphone → allow desktop apps (the app also surfaces a direct link to this when it detects the mic is blocked). |
| `[session] findRelevantMemories failed` with `ERR_DLOPEN_FAILED` on `onnxruntime_binding.node` | `onnxruntime-node`'s native addon is missing a dependency DLL — almost always the Microsoft Visual C++ Redistributable (x64) isn't installed. Install it, restart your terminal, and if it still fails do a clean `server/node_modules` reinstall (antivirus sometimes strips files post-install). Non-fatal either way — the voice/tool loop keeps working, only memory recall is degraded until fixed (see `server/src/memory/embeddings.ts`). |

## Adding a new app to the whitelist

Open `agent/src/main/tools/appRegistry.ts` and add an entry, e.g.:
```ts
vscode: { openCommand: "code", processName: "Code.exe" },
```
Omit `processName` if the app shouldn't be force-closable (see the file's
own comments — e.g. File Explorer). This keeps the security model intact —
the LLM can only ever request an app **name**, never an arbitrary path or
command.
