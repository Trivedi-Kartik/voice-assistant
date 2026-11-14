---
name: verify-integrations
description: Check that Postgres (Neon), Redis (Upstash), migrations, Groq and the local server are actually reachable and working. Use when asked whether the integrations/infrastructure work, after changing env vars, or when auth/WS/rate-limit behavior looks broken.
---

# Verify infrastructure

Run from `server/`. **Never print `.env` values** (they are live credentials) — load them via `dotenv`/`set -a; . ./.env` and only print pass/fail and non-secret facts. These checks hit the real Neon/Upstash/Groq, so keep writes minimal and clean up anything created.

1. **Postgres + migrations**
   `npx prisma migrate status` → expect "Database schema is up to date!". Then a `select 1` via a tiny script using `@prisma/client`.
2. **Redis** — with `ioredis` (`REDIS_URL` is `rediss://`, TLS): `PING`, then `SET k 1 EX 10` / `GET`. An `ENOTFOUND` on the `*.upstash.io` host means the Upstash database was deleted/archived (free tier) — a new database + new `REDIS_URL` in both `server/.env` and the Render env vars is the fix, not a code change. Redis down breaks WS tickets, the daily turn cap and the history buffer.
3. **Groq** — `GET https://api.groq.com/openai/v1/models` with `GROQ_API_KEY`; confirm the models named in `server/src/llm.ts`, `stt.ts`, `vision.ts`, `automation/vision.ts` are still listed (model names have been decommissioned out from under this project three times — `docs/RISK_REGISTER.md` #2).
4. **Code health**: `npm run typecheck && npm test` (tests mock the I/O boundary — they don't prove the integrations work).
5. **End to end** (optional): `PORT=8080 npm run dev`, `curl localhost:8080/health`, then signup → `/auth/ws-ticket` → open the `ws://localhost:8080/ws?ticket=…` socket and expect `{"type":"auth_ok"}`. Delete any test user you created (use an `@example.invalid` email so they're identifiable) and stop the server.

Report each item pass/fail with the evidence, and say plainly what you did not check (e.g. the deployed Render instance, the packaged desktop app).
