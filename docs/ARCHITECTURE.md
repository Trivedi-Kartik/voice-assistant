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

### Confirmation for sensitive tools: spoken, not clicked

Three tools (`close_app`, `read_clipboard`, `take_screenshot_and_describe`)
need a real checkpoint before they run — closing an app can lose unsaved
work, and the other two ship potentially private data to a cloud LLM. The
original design gated these behind a client-side `dialog.showMessageBox`
Allow/Deny popup. That was replaced after real usage feedback: a voice
assistant that makes you walk over and click a mouse defeats its own point.
The replacement is voice confirmation, and it had to move server-side — the
confirmation now spans two separate turns (the question, then the answer),
and only the server's `Session` (`server/src/ws/session.ts`) has state that
survives between turns. `ToolDefinition` (`agent/src/main/tools/types.ts`)
no longer has a `sensitivity`/`describe` field at all — the client has no
concept of "this one needs confirmation" anymore.

How it works: `CONFIRMATION_PROMPTS` (`server/src/tools/schemas.ts`) maps a
tool name to a function producing its spoken question (e.g. `close_app` →
"Close Chrome? Say yes to confirm."). When the LLM calls a tool in that map,
`Session.runTurn` never dispatches it — it answers that tool_call with a
placeholder result (`{ok:false, message:"Waiting for the user's
confirmation."}`, since every `tool_calls` entry must be answered before the
next Groq call, protocol-wise), records it on `this.pendingConfirmation`,
and ends the turn by sending the deterministic question directly as
`assistant_text` — **not** by asking the model to phrase it via another
completion call, since that would mean trusting the model to reliably follow
an "ask, don't call the tool again" instruction, and real testing this
session already surfaced genuine tool-calling flakiness elsewhere. The
*next* turn's transcript is checked against `pendingConfirmation` first,
before anything else: a small deterministic keyword match
(`classifyConfirmation`, punctuation-stripped — Whisper transcripts almost
always end in one) decides yes/no/unclear, unclear counts as no (same
fail-safe default the old dialog's `cancelId` already had), and only on a
clear "yes" does the real tool call finally get dispatched — as a **brand
new, self-contained** `tool_calls`/`tool` exchange with a freshly minted call
ID, never by reusing the original call's ID. That distinction matters and
was a real bug once: the original call was already fully closed out (by the
placeholder above) in the turn that asked the question, so re-answering it
later — with a user message now sandwiched in between — is an invalid
message sequence for Groq's chat format and caused the model to just
re-issue the same call forever instead of reacting to "yes." If a single LLM
turn somehow produces two sensitive calls at once, only the first becomes
resolvable — the second is simply never run. The safety property this
guarantees: a sensitive tool physically cannot execute without going through
this state machine, regardless of how a batch is shaped or how the model
misbehaves.

`pendingConfirmation` is in-memory on `Session`, not persisted — same as
`pendingCalls` (the tool round-trip map). A disconnect between the question
and the answer just means the eventual "yes" is treated as a fresh,
contextless utterance next time, never as an accidental confirmation.

### App control: `open_app` / `close_app`

Both read from one whitelist, `agent/src/main/tools/appRegistry.ts` — an app
name maps to an `openCommand` (`start`) and, optionally, a `processName`
(`taskkill /IM ... /F`). An app with no `processName` is **open-only**: File
Explorer, Settings, and Control Panel are deliberately excluded from
`close_app` because force-closing them (`explorer.exe` especially) takes down
the whole taskbar/desktop shell, not just one window — this isn't a gap to fill
in later, it's a permanent exclusion.

`close_app` is one of the three tools gated by spoken confirmation (see
"Confirmation for sensitive tools" above) — `open_app` isn't, and runs
immediately, same as v1.

### `control_media`

Simulates OS media-key presses (play/pause, next/prev, volume, mute) via
`user32.dll`'s `keybd_event`, invoked through a fixed PowerShell `-Command`
(`agent/src/main/tools/controlMedia.ts`) — the global, hardware-key-equivalent
mechanism, so it works regardless of which app has focus. Deliberately not a
native Node addon (e.g. `robotjs`): a prebuilt native binding
(`onnxruntime-node`, used for memory embeddings) already failed to load on a
real Windows machine for an unrelated feature, and PowerShell + `user32.dll`
ship with every Windows install, no extra dependency to get wrong. The only
variable substituted into the script string is a virtual-key integer, always
one of 7 fixed values resolved from an enum — never LLM/user-supplied text,
same "fixed argv, no interpolated arbitrary strings" rule as every other tool.

### `set_reminder`

Client-local by design, not server-backed: reminders are stored on-device
(`agent/src/main/reminders/reminderStore.ts`, `electron-store`, same pattern
as `consent.ts`/`deviceId.ts`) and fired by an in-process interval
(`reminderScheduler.ts`) via Electron's native `Notification` API. The server
never learns reminder content beyond the usual `ToolInvocation` audit log
written for every client-dispatched tool call.

This was a deliberate scope call, not an oversight: a server-backed version
would need a new Postgres table, the first background poller in this
codebase, and the first userId→live-connection registry (today the server
only ever responds to a message on the same connection, never initiates) —
that's front-loading Phase 6's task-queue work into what the roadmap calls a
"low-risk" increment. Revisit if multi-device sync or app-not-running
delivery becomes a real user complaint.

**Known limitations, by design:** only fires if the Electron app is running
(tray counts) at fire time — fully quitting the app or shutting down the PC
loses it, same as any local alarm app. An overdue reminder still fires
immediately on next launch (catch-up), so it's delayed, not silently dropped.
No cross-device sync. Time parsing is relative-delay-only (`delayMinutes`,
not "at 6pm") — nothing here tells the model the user's timezone yet, so an
absolute time risks firing at the wrong local hour.

### `read_clipboard`

Gated by spoken confirmation for a different reason than `close_app`: this
isn't about irreversible damage, it's about not silently shipping
potentially private clipboard content (passwords, OTPs, anything) to a
cloud LLM without the user knowing. Same mechanism either way — it doesn't
distinguish "risky because destructive" from "risky because private," and
doesn't need to; both warrant asking first. Content is truncated to 4,000 characters
(`agent/src/main/tools/readClipboard.ts`) so a large copied document doesn't
blow up conversation token usage.

### `take_screenshot_and_describe`

The most privacy-sensitive tool yet — same spoken-confirmation gate as
`close_app`/`read_clipboard`, but here it's about an actual image leaving
the device, not text.

**The image never touches `ToolInvocation`, deliberately.** Every other
client tool's `ToolResult` flows back over the WS `tool_call`/`tool_result`
protocol and gets persisted verbatim into the `ToolInvocation` audit table
(`ws/session.ts`'s `dispatchToolCall`). A full screen capture (passwords,
private messages, anything visible) durably stored in Postgres forever would
be a real problem, so this tool takes a different path entirely: the client
captures the screenshot and posts it directly to a dedicated
`POST /vision/describe` endpoint (`server/src/vision/routes.ts`,
`requireAuth`-protected) via a new `authManager.describeScreenshot()` method
— never through the WS protocol. The server calls Groq's vision model
(`server/src/vision.ts`, currently `qwen/qwen3.6-27b` — a single named
constant, deliberately: the original choice here,
`llama-3.2-11b-vision-preview`, was already decommissioned by Groq by the
time this shipped, confirmed via real testing, "model_decommissioned." Groq's
vision-model lineup has changed twice within this project's lifetime — treat
this constant as needing a periodic check against
`console.groq.com/docs/vision`, not a one-time choice) and returns only the
resulting **text** description. That
text is the only thing that ever becomes this tool's `ToolResult` and
re-enters the normal flow — the image itself exists only in that one HTTPS
request body and briefly in server memory for one Groq call.

Two supporting details:
- `server/src/index.ts`'s body-size limit is now scoped per-router
  (`/auth` keeps the small express default, `/vision` gets 25MB) rather than
  raised globally — a base64 screenshot needs real headroom, but every other
  route shouldn't get a looser limit as a side effect.
- `/vision/describe` calls the same `checkAndConsumeTurn` the WS turn loop
  uses, even though it's a plain REST endpoint outside that loop — otherwise
  an authenticated client could hit it directly and unbounded, burning
  through the shared Groq key's quota for free.

**v1 scope:** primary display only, not all monitors — multiple images per
call multiplies cost, and "describe my screen" is ambiguous with several
monitors anyway.

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

**Conversation transcripts persist durably as of Phase 2** (`conversations` /
`messages` tables) — this was ephemeral-only in v1 (Redis, short TTL, cleared on
disconnect) specifically to avoid taking on a data-retention obligation before the
core loop was validated. Now that it's a real, disclosed feature, Redis is still
used as a short-TTL cache for the in-flight session's working history (so a live
turn doesn't round-trip Postgres on every message) but is no longer the only copy.

## Memory / personalization (Phase 2)

`memory_facts` (Postgres, `pgvector` extension) stores per-user preferences as
embeddings — e.g. "prefers searching in Chrome, not Edge." Two deliberate design
choices:

- **Explicit, not passive.** Facts are only ever written when the assistant calls
  a `remember_preference` tool (`server/src/tools/schemas.ts`) — never by silently
  scanning every conversation for "interesting" facts. This keeps what gets
  remembered predictable and attributable to a specific moment, not a black-box
  heuristic a user can't reason about.
- **Server-handled, not client-executed.** Unlike `open_app`/`web_search`/`open_url`,
  `remember_preference` never round-trips to the client (see
  `SERVER_TOOL_SCHEMAS`/`SERVER_TOOL_NAMES` in `tools/schemas.ts` and
  `Session.handleServerTool()` in `ws/session.ts`) — it's a database write, not an
  OS action, so there's nothing for a device to "implement" and no reason to pay a
  WebSocket round-trip.

Retrieval is RAG-style, not tool-based: each turn, the user's transcript is
embedded and matched against that user's stored facts via pgvector cosine
distance (`memory/memoryStore.ts`), and anything sufficiently relevant gets folded
into the system prompt before the LLM call. The model never has to explicitly
"ask" for memories — relevant context is just already there.

Embeddings run locally (`@xenova/transformers`, `Xenova/all-MiniLM-L6-v2`,
384-dim) — no external API call per embed, no added Groq cost. Because Prisma
can't generate typed accessors for pgvector's `vector` column type, all reads/
writes to `memory_facts.embedding` go through raw SQL (`$queryRaw`/`$executeRaw`),
not the normal Prisma Client API — see the file comments in `memoryStore.ts`.

## Known reliability limitation: Groq tool-call generation failures

Confirmed via repeated real testing (not hypothetical): Llama 3.3 on Groq
occasionally produces a malformed tool call — literally text like
`<function=open_app{...}</function>` instead of a proper structured call — and
Groq's API rejects the whole completion with a 400 `tool_use_failed` error. This
is generation-quality noise, not a deterministic bug in this codebase: identical
requests succeed on a retry most of the time, and it happens more often on
compound requests ("open X and search Y") than single-action ones.
`server/src/llm.ts` retries automatically (up to 6 attempts) when it detects this
specific error, which measurably improves reliability but does not eliminate it
— in testing, roughly an 80% single-attempt-success rate on the hardest compound
case became ~80-90%+ with retries, not 100%. If a turn still fails after
exhausting retries, the user gets a specific, actionable error ("try asking one
thing at a time") rather than a generic failure. This is an upstream model/API
reliability characteristic, not something fully fixable in application code —
worth revisiting (e.g. a different tool-calling model) if it proves disruptive in
practice.

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

## Current limitations (intentional)

- Only 3 client-executed tools ship: `open_app`, `web_search`, `open_url` — the
  already-safest class (no data exfiltration, no destructive actions).
- Push-to-talk hotkey, not wake-word — always-on listening is a bigger consent
  surface on a hosted multi-tenant product; earn that trust first.
- TTS is browser `SpeechSynthesis` — free, swappable later behind the `TtsEngine`
  interface (`agent/src/renderer/audio/ttsPlayback.ts`) without touching the UI.
- Desktop (Windows) only — no mobile companion yet, though the auth/session design
  doesn't assume Electron-specific concepts, so a React Native client later is an
  additive client, not a protocol rewrite.
