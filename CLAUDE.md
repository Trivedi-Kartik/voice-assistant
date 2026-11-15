# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Karvix: a real, multi-tenant voice assistant (strangers sign up and use it — treat it as production, not a demo). The user speaks; an Electron desktop client streams audio to a hosted Node backend, which transcribes (Groq Whisper), runs a tool-calling LLM loop (Groq `openai/gpt-oss-120b`), and sends tool calls back to the desktop client to execute on the real OS. Windows and Linux are supported.

## Repo shape: two independent npm packages

No root `package.json`, no workspaces. `server/` and `agent/` have separate `node_modules`, separate builds, and are deployed separately (server → Docker on Render via `render.yaml`; agent → electron-builder installers). Run all commands from inside the package directory.

### server/ (Express + ws, Prisma/Postgres on Neon, ioredis/Upstash)
```bash
npm run dev                    # tsx watch src/index.ts (listens on :8080, WS at /ws)
npm run typecheck              # tsc --noEmit
npm test                       # vitest run
npx vitest run src/toolLoop.test.ts            # one test file
npx vitest run -t "pauses on a confirmation"   # one test by name
npm run build && npm start     # tsc -p tsconfig.build.json → dist/
npx prisma migrate dev         # create/apply migration locally
npm run prisma:migrate:deploy  # apply existing migrations (prod)
```
Required `server/.env`: `GROQ_API_KEY`, `DATABASE_URL` (Neon pooled), `REDIS_URL` (`rediss://`), `JWT_SECRET`, `BYOK_ENCRYPTION_KEY` (base64 of 32 bytes), `DAILY_TURN_CAP`; `SENTRY_DSN` optional. `src/env.ts` fails fast on missing ones. `.env` points at the real cloud Neon/Upstash instances — local dev and tests-with-DB touch real data.

### agent/ (Electron + React/Vite)
```bash
npm run dev          # vite (:5173, strictPort — hardcoded in main/window.ts) + tsc -w main + electron
npm run typecheck    # main AND renderer tsconfigs
npm run build        # vite build (renderer) + tsc (main) → dist/
npm run package      # build + electron-builder → release/ (Windows nsis .exe, Linux AppImage)
```
`agent/` has a small `node:test` suite (`npm test` — builds, then runs `agent/test/`) for the pure device-side guards; no linter is configured (the `eslint-disable` comments in source reference one that isn't set up). `SERVER_HTTP_URL` / `SERVER_WS_URL` default in code to the production Render URL (`main/auth/authManager.ts`, `main/ws/connection.ts`); `agent/.env` is dev-only and is never bundled into a packaged build.

## Architecture (the parts that span multiple files)

**One turn:** renderer records 250ms webm/opus chunks (`renderer/audio/micCapture.ts`) → IPC → main process forwards over WS as `audio_chunk`/`audio_end` → `server/src/ws/session.ts` `runTurn()` transcribes, pulls relevant `MemoryFact`s (pgvector) into the system prompt, then runs `runToolLoop` (`server/src/toolLoop.ts`, deliberately independent of Session/WS, bounded steps) → client-executed tools go out as `tool_call` and return as `tool_result` → final `assistant_text` is spoken by the renderer (browser SpeechSynthesis; `spd-say` via main process on Linux because Chromium has no Linux TTS backend).

**Security boundary on the client:** the renderer only sees the narrow `window.jarvis` API from `preload/index.ts` (mirrored by `ipc/ipcHandlers.ts` and typed in `renderer/jarvis.d.ts` — adding a capability means touching all three). The access token lives in main-process memory only; the refresh token is persisted via `auth/tokenStore.ts`.

**Identity & sessions:** WS auth is a single-use 30s Redis ticket (`POST /auth/ws-ticket` → `auth/wsTicket.ts`), consumed in `ws/server.ts`, which binds `{userId, deviceId}` to one `Session` for the connection's lifetime — no later message carries identity. Refresh tokens rotate; reuse of a rotated token revokes the whole (user, device) chain. `ws/userLock.ts` is an in-memory per-user turn lock (not Redis-backed — breaks if the server ever runs >1 instance).

**Postgres vs Redis:** Postgres (Prisma, `server/prisma/`) holds durable data: users, devices, refresh tokens, conversations/messages, memory facts, tool invocations, usage events, tasks/task steps. Redis is ephemeral only: per-conversation history buffer (1h TTL), WS tickets, per-user/day rate-limit counters (`rateLimit.ts`). If Redis is down, WS auth, the daily cap and the history buffer all break.

**Tool system — three kinds, one registry in progress:** client tools (executed by the desktop; one file each in `agent/src/main/tools/`, registered in `tools/index.ts`), server tools (`remember_preference`, handled in-process in `session.ts`), and the `computer_use_task` automation sub-loop (`server/src/automation/runner.ts` + `agent/src/main/automation/`, screenshot → decide → act, with its own mid-task spoken confirmation). Tools whose risk level is not `low` pause the turn and ask a deterministic spoken confirmation that is resolved by the *next* voice turn. `server/src/tools/toolDefinitions.ts` is the new canonical list that `tools/schemas.ts` derives from (Phase 2 of `docs/IMPLEMENTATION_ROADMAP.md`). A device only gets the client tool schemas it declared in `Device.capabilities` (sent at login from `agent/src/main/deviceCapabilities.ts`).

**Hand-duplicated contracts (no shared module, by design):** tool names (`agent/src/shared/toolContract.ts` ↔ `server/src/tools/toolNames.ts`), WS protocol types (`agent/src/shared/protocol.ts` ↔ `server/src/protocol.ts`), supported languages (agent `renderer/i18n` ↔ `server/src/i18n/languages.ts`). Change both sides together; boot-time assertions (`assertSchemasMatchContract()`, the registry check in `tools/index.ts`) throw on tool-name drift. Eight UI languages, each with its own dictionary and server-side confirmation/message strings.

**Platform-specific tools:** OS differences live in `*.win.ts` / `*.linux.ts` siblings (`appExec`, `appRegistry`, `addCustomApp`, `inputSim`) selected by the un-suffixed file. `control_media` is Windows-only and excluded from Linux capabilities.

## Working in this repo

- Each real bug fix in this codebase is documented in a "Real bug, caught by…" comment explaining the failure mode — read the surrounding comment before changing the code it's attached to (e.g. the MIME-type order in `micCapture.ts`, the `Dockerfile` OpenSSL step, the packaged-build resource paths in `electron-builder.yml`).
- Docs worth reading before big changes: `docs/CURRENT_ARCHITECTURE.md` (as-is, verified against code), `docs/ARCHITECTURE.md` (design + failure modes), `docs/TARGET_ARCHITECTURE.md` and `docs/IMPLEMENTATION_ROADMAP.md` (phased refactor in progress), `docs/SETUP.md`, and `docs/CHANGELOG.md` for the history of why things are the way they are. Some older docs predate the vitest suite in `server/` and still say no tests exist.
- A future "phone/browser as remote for the desktop agent" design (route a session's tool calls to a paired desktop device) was discussed but not started; a standalone browser client was tried and removed because browsers can't perform the desktop tools.

## Karvix 2 PC agent (`pc_task`) — see `docs/PC_CONTROL_PLAN.md`

- **Server** `server/src/agent/`: `actions.ts` (compact action schemas — keep them small: every planner call re-sends them and the shared free Groq key is capped at 8K tokens/min and ~200K tokens/day), `planner.ts` (Groq, one function call per step), `runner.ts` (loop: budgets, verification, ask/confirm pauses across voice turns, cancel), `safety.ts` (deterministic gate — never trusts the model's risk judgement), `wsDevice.ts` (device over WS with timeouts). Offered as `pc_task` only to clients whose `client_hello` includes `pc_agent`; older clients keep `computer_use_task`. Per-user daily cap: `PC_TASK_DAILY_CAP` (BYOK users exempt).
- **Capabilities (all behind one planner, one function call per step):** `file` (home-only), `open_app`/`open_url`, `clipboard`, `system` (volume/brightness/dark mode/Wi-Fi/Bluetooth/lock), `web` (Playwright on a dedicated Chrome profile via the DOM — `agent/src/main/agent/browser/`), UI actions via accessibility (`click`/`set_text`/`close_window`/`focus_window`, Linux AT-SPI + Windows UIA), `type_text`/`hotkey` (X11 xdotool, Wayland via the RemoteDesktop portal in `a11y/portal*.{ts,py}`, Windows SendKeys), `screen look` (vision, consent once per task). Vision *clicking* exists but is OFF (`VISION_CLICK_ENABLED`) because it measured unreliable. Users may pick their own model for PC tasks in Settings (`server/src/agent/providers.ts`, allowlisted hosts, no automatic fallback).
- **Desktop** `agent/src/main/agent/`: `agentHost.ts` answers `agent_request` (observe/act/verify), `skills.ts` (home-only file ops via `paths.ts`, re-confirms delete/overwrite client-side), `desktop.ts` (observation + UI actions), `ui.ts` + `a11y/` (Linux accessibility: reads real window elements with stable ids and presses/types/closes them via AT-SPI, works on Wayland; `a11y/atspi_helper.py` is copied into `dist/` by `scripts/copy-assets.js` and run with `python3 -c`), `guards.ts` (never type into terminals). `a11y/uia_helper.ps1` is the Windows UI Automation helper — UNTESTED on real Windows (CI smoke test `agent/test/uia-smoke.ps1`). `agentHost.ts` re-checks everything risky on the device (terminals, system dialogs, secret fields, focus).
- **Safety invariants to preserve:** the device never types into terminals or system permission/password dialogs, never types passwords/payment details, refuses keystrokes unless exactly one window has the keyboard and it is the intended one, and risky clicks/deletes/overwrites need a spoken yes (server gate + device re-check). Page/screen/file text is untrusted data. Never run screen-capturing tests with secrets visible — screenshots go to a third-party model.
- **Eval** (real planner + real skills in a sandbox home, inside Electron; uses the Groq key from `server/.env` and spends its quota):
  ```bash
  cd agent && npm run build && (cd ../server && npm run build)
  node_modules/electron/dist/electron --no-sandbox eval/run-eval.js [taskId ...]
  EVAL_MODEL=openai/gpt-oss-20b node_modules/electron/dist/electron --no-sandbox eval/run-eval.js   # separate quota
  ```
  Add `--trace` to print each step's result, `--ui` for the real-GUI tasks (they open Calculator/Text Editor on your screen). Tasks live in `agent/eval/tasks.js`; results in `agent/eval/last-results.json` (gitignored). A full run costs ~60-100K Groq tokens of the ~200K/day free allowance — don't run it twice in a day on the production key. `agent/eval/e2e-voice.js` is the real voice-pipeline test (needs a local server).

## Project skills and agents (`.claude/`)

Skills (invoke by name; the ones marked ✋ only run when you ask for them):
- `add-tool` — the full cross-package checklist for adding/changing a tool (contracts, definition, confirmation prompts in 7 languages, agent implementation, registry, capability, tests).
- `add-language` — every server + agent touch point for a language.
- `db-migration` ✋ — Prisma changes: **never** run `migrate dev/reset` against `server/.env` (it is the real Neon DB); use a throwaway pgvector container. Production does not auto-migrate.
- `verify-integrations` — Postgres/Redis/Groq/server health check without printing secrets.
- `release-desktop` ✋ — build and publish Windows/Linux installers.
- `log-change` — what docs to update after a change (CHANGELOG format, registers, ADRs).

Agents (read-only reviewers): `contract-sync-checker` (server↔agent drift), `tool-safety-reviewer` (safety model for tools/confirmations/identity), `migration-reviewer` (static review of a schema migration). Run the relevant one before finishing work in its area.

`.claude/settings.json` is shared: it pre-allows typecheck/test/git-read commands, denies reading `.env` files and `prisma migrate reset` / `db push`, and asks before `migrate dev` / `migrate deploy`. Personal permissions live in the untracked-by-convention `settings.local.json`.

## Docs upkeep

Update docs in the same change as the code (see `log-change`). `docs/CHANGELOG.md` is newest-first and is the source of truth for what actually exists; roadmap/tech-debt/risk/capability docs in `docs/` are working records, and several entries are stale — fix what you touch rather than adding contradicting notes.
