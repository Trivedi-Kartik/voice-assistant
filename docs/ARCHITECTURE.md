# Architecture

## Why multi-tenant from day one?

This is a real product real strangers will sign up for and use — not a personal
tool. That means accounts, per-user data isolation, and a hosted backend are
required from the start, not an afterthought layered on later.

## Why two separate processes (Client vs Server)?

1. **Security.** Groq API keys (shared and BYOK) must never live in a client app
   someone could inspect. They stay server-side. The client only ever talks to the
   hosted backend.
2. **Separation of concerns.** The "brain" (understanding language, deciding what
   to do, per-user account/session state) and the "hands" (actually touching a
   user's OS) are different responsibilities on different trust boundaries. This
   also sets up cleanly for a mobile companion client later — just another thin
   client authenticating against the same backend.

## Why a strict tool whitelist instead of letting the LLM run raw commands?

This is the single most important safety decision in this project, and it matters
*more*, not less, now that real distrusted users are involved. The LLM **never**
generates a shell command directly. It can only call from a fixed, named set of
tools (`open_app`, `web_search`, `open_url`, ...) with typed parameters. The actual
OS command for each tool is hardcoded in `agent/src/main/tools/`.

**Rules for every future tool:**
- Structured parameters only (a name, a query, a URL) — never a raw command string
  passed to `exec()`. Use `execFile`/`spawn` with a fixed argv, never `exec()` with
  an interpolated string.
- No v1 tool feeds untrusted external text (webpage/email content) into the LLM's
  context — `web_search` only opens a browser tab, it never scrapes the result page
  back into the conversation. This closes the prompt-injection vector by scope. The
  day a tool needs to read external text, injection defenses (treat fetched text as
  inert data, never as instructions) become a hard requirement, not before.
- Tool name strings are the one real contract between `agent/` and `server/` (kept
  in sync by hand — see `agent/src/shared/toolContract.ts` and
  `server/src/tools/toolNames.ts` — both packages assert their local registry
  matches on startup).

## Auth flow (email/password, JWT + refresh)

1. Client generates/persists a `deviceId` locally.
2. `POST /auth/signup` / `POST /auth/login` (HTTPS) → bcrypt-verified, upserts a
   `devices` row, returns `{ accessToken, refreshToken }`.
3. `refreshToken` is persisted via Electron `safeStorage` (OS-encrypted). The
   `accessToken` lives in the client's main-process memory only — **never** the
   renderer, which is the process most likely to ever load anything web-ish later.
4. Before opening the WebSocket, the client exchanges the access token for a
   **one-time, 30s-lived ticket** (`POST /auth/ws-ticket`) and connects
   `wss://.../ws?ticket=...` — this keeps the long-lived JWT out of a URL that could
   land in proxy/access logs.
5. The server validates/consumes the ticket on WS upgrade and binds the connection
   to `{ userId, deviceId }` for its whole lifetime. No message the client sends
   afterwards is ever trusted to carry a `userId`.
6. Access tokens refresh proactively (~80% of TTL). Refresh tokens rotate on every
   use; reuse of an already-rotated token revokes the whole chain (theft becomes
   detectable, not silently exploitable).

## Data model

Durable (Postgres via Prisma): `users`, `devices`, `refresh_tokens`, `usage_events`
(per-user/day counters), `tool_invocations` (an audit log of real OS actions taken —
tool name/args/result/timestamp, **not** conversation content).

**Conversation transcripts are ephemeral in v1** — buffered in Redis with a short
TTL, cleared on disconnect, not written to a permanent table. This is a deliberate
choice to avoid taking on a data-retention/privacy obligation before the core loop
is validated. Persisted transcripts + a `memory_facts`/embeddings table for
preference learning is a v2 addition, once "memory" is an explicit, disclosed
feature (see `ROADMAP.md`).

## Session management & isolation

One WebSocket connection = one in-memory `Session` (`server/src/ws/session.ts`).
Every `tool_call` the server issues carries a server-generated `callId` scoped to
that connection's own `pendingCalls` map — a `tool_result` for a callId pending on a
*different* connection is structurally impossible to route, not just disallowed by
convention. A per-user lock (`server/src/ws/userLock.ts`) serializes turns even
across a user's multiple devices, which also protects the shared Groq quota from
one user's concurrent devices doubling their draw.

## Message protocol (WebSocket, Client ⇄ Server)

Defined once in `agent/src/shared/protocol.ts` (mirrored by hand in
`server/src/protocol.ts` — see the file comments for why these two packages
duplicate rather than import across a package boundary).

**Client → Server**
| type | payload | meaning |
|---|---|---|
| `audio_chunk` | `{ data: base64 }` | a streamed chunk of the current utterance |
| `audio_end` | — | utterance is complete, run STT + the tool-calling loop |
| `tool_result` | `{ callId, result }` | result of a tool the client just executed |
| `resume` | `{ conversationId }` | rehydrate a prior conversation's history |

**Server → Client**
| type | payload | meaning |
|---|---|---|
| `auth_ok` | — | ticket validated, connection is live |
| `transcript` | `{ text }` | what Whisper heard |
| `tool_call` | `{ callId, name, args }` | server wants the client to run this tool |
| `assistant_text` | `{ text }` | final reply to speak out loud |
| `assistant_audio` | reserved | unused in v1 (browser SpeechSynthesis); seam for Piper/ElevenLabs later |
| `error` | `{ code, message }` | rate-limited, auth expired, STT/LLM failure, etc. |

## Cost control (Groq's free tier is shared, not per-user)

- A per-user daily turn cap is enforced server-side (Redis counter,
  `server/src/rateLimit.ts`) before every Groq call.
- Users can add their own Groq API key in Settings (encrypted at rest, AES-256-GCM)
  — when present, the cap is lifted entirely for that user. This is the pressure
  valve that avoids needing Stripe/billing in v1.

## Current limitations (intentional, for v1)

- Only 3 tools ship: `open_app`, `web_search`, `open_url` — the already-safest
  class (no data exfiltration, no destructive actions).
- No persisted memory/personalization (see Data model above) — fast-follow, not v1.
- Push-to-talk hotkey, not wake-word — always-on listening is a bigger consent
  surface on a hosted multi-tenant product; earn that trust first.
- TTS is browser `SpeechSynthesis` — free, swappable later behind the `TtsEngine`
  interface (`agent/src/renderer/audio/ttsPlayback.ts`) without touching the UI.
- Desktop (Windows) only — no mobile companion yet, though the auth/session design
  doesn't assume Electron-specific concepts, so a React Native client later is an
  additive client, not a protocol rewrite.
