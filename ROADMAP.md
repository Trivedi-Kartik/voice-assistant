# Roadmap

Ordered by what unlocks the most value next for a **multi-tenant** product — this
order differs from a purely technical build sequence (see reasoning per phase).
Each phase builds on a working previous phase.

## ✅ v1 — Core loop, multi-tenant (this build)
Accounts (signup/login) → hotkey push-to-talk → STT → LLM tool-calling → whitelisted
tool execution → spoken reply. Per-user session isolation, shared-key daily rate
cap with a BYOK escape valve, ephemeral (non-persisted) conversation transcripts.
Tools: `open_app`, `web_search`, `open_url`. See `docs/CHANGELOG.md`.

## ✅ Phase 2 — Persistent memory / personalization (this build)
- Conversation history now persists durably (`conversations`/`messages` tables),
  not just the v1 ephemeral Redis buffer — an explicit, disclosed feature (see
  `docs/ARCHITECTURE.md`), not silent logging.
- Per-user preference memory via a new server-handled `remember_preference` tool
  — the assistant explicitly decides when something's worth remembering (e.g.
  "prefers Chrome over Edge"), rather than passively scanning every conversation.
  Facts are embedded locally (`@xenova/transformers`, free, no API cost) and
  stored in Neon's `pgvector` extension — no second vector database needed.
- Relevant memories are retrieved by semantic search each turn and folded into
  the system prompt (RAG-style) — the model doesn't need to explicitly call a
  "recall" tool, relevant context is just already there.
- **Why first:** with real accounts already in place, "it remembers my
  preferences" is the single strongest retention lever available — stronger here
  than in a single-user design, where there's no one to retain.
- **Found and fixed while building this:** Groq's Llama 3.3 occasionally
  generates a malformed tool call (Groq rejects it with a 400 `tool_use_failed`)
  on totally valid requests, especially compound ones ("open X and search Y") —
  confirmed via repeated real testing, not hypothetical. Added automatic retry
  (up to 4 attempts) in `server/src/llm.ts`, which measurably improves but does
  not eliminate this — a residual reliability gap in the underlying model/API,
  not something fixable purely in this codebase. Worth revisiting if it proves
  disruptive in practice (e.g. a different tool-calling model).

## Phase 3 — More tools, incrementally

### ✅ Increment 1 — App control expansion (this build)
- `open_app` widened from a handful of browsers/editors to a curated whitelist
  covering browsers, editors, Office, media, communication apps (WhatsApp,
  Teams, Slack, Discord, Zoom), and system utilities (camera, file explorer,
  task manager, paint, settings, control panel, terminal, PowerShell) — see
  `agent/src/main/tools/appRegistry.ts`, the new single source of truth for
  both `open_app` and `close_app`.
- New `close_app` tool — the first tool that can involuntarily kill a running
  program. File Explorer/Settings/Control Panel are permanently open-only
  (force-closing `explorer.exe` takes down the whole shell). This is also the
  first real use of the `sensitivity: "high"` field: every `close_app` call
  goes through an Allow/Deny confirmation dialog before it runs. See
  `docs/ARCHITECTURE.md` "App control."
- Exact `start`/`taskkill` names for less common apps are best-effort pending
  a pass on a real Windows machine (this dev environment is Linux) — apps not
  actually installed/running already fail gracefully either way.

### ✅ Increment 2 — `control_media` + `set_reminder` (this build)
- New `control_media` tool — play/pause, next/prev, volume, mute — simulated
  via `user32.dll`'s `keybd_event` through a fixed PowerShell command, not a
  native Node addon. See `docs/ARCHITECTURE.md` "control_media."
- New `set_reminder` tool — relative-delay only ("in 10 minutes", not "at
  6pm" — no timezone plumbing yet). Deliberately **client-local**
  (`electron-store` + Electron `Notification`, no server changes): avoids
  front-loading Phase 6's task-queue/background-job infra into a "low-risk"
  increment. Known limitation: only fires if the app is running at the time;
  overdue reminders catch up on next launch rather than being lost. See
  `docs/ARCHITECTURE.md` "set_reminder" for the full trade-off.

### ✅ Increment 3 — `read_clipboard` (this build)
- New `read_clipboard` tool — the second `sensitivity: "high"` tool, gated by
  the same Allow/Deny confirmation as `close_app`, but for a different reason
  (privacy, not destructiveness — see `docs/ARCHITECTURE.md`). Truncated to
  4,000 characters.

### ✅ Increment 4 — `take_screenshot_and_describe` (this build)
- New tool — captures the primary display, sends it to a dedicated
  `POST /vision/describe` endpoint (`server/src/vision/`), which calls
  Groq's `qwen/qwen3.6-27b` and returns a text description. The
  image deliberately never enters the WS `tool_call` protocol or the
  `ToolInvocation` audit table — only the resulting text does. Third
  privacy-sensitive tool (the most sensitive one yet). See
  `docs/ARCHITECTURE.md` "take_screenshot_and_describe" for the full design,
  including why `/vision`'s Express body-size limit had to be scoped
  per-router rather than raised globally, and why it reuses the same
  daily-turn rate limit the WS loop uses.
- Primary display only, not every monitor — documented v1 limitation, not
  an oversight.

### ✅ Confirmation moved from a click popup to spoken yes/no (this build)
- `close_app`, `read_clipboard`, and `take_screenshot_and_describe` no
  longer gate on a client-side Allow/Deny dialog — changed after real usage
  feedback that a voice assistant requiring a mouse click defeats its own
  point. Now the assistant asks out loud and the *next* voice turn resolves
  it (say "yes" to confirm, anything else cancels). This moved the whole
  mechanism server-side, into `Session` (`server/src/ws/session.ts`) — see
  `docs/ARCHITECTURE.md` "Confirmation for sensitive tools" for the full
  design and its safety invariant.

### Next
- `send_email_draft` — **not paid**, the Gmail API itself is free at this
  usage volume; blocked on external *setup*, not cost: needs a Google Cloud
  OAuth client (ID/secret) the user has to create themselves (setup steps
  already given), plus its own mini privacy review before shipping, per
  this file's own original framing. Drafts only, never sends —
  that's the point of the name.
- Each new tool still follows the strict-whitelist rule from `docs/ARCHITECTURE.md`,
  ships as its own reviewed increment (not a single "Phase 3 dump"), and gets
  a matching entry in **both** `docs/CAPABILITIES.md` (repo-facing) and
  `agent/src/renderer/components/HelpPanel.tsx`'s `CAPABILITIES` array
  (the same thing, but inside the actual app — an installed-app user never
  sees the repo). Also update `App.tsx`'s `TOOL_LABELS` map so the new
  tool's activity chip shows a real label instead of its raw snake_case name.

## Phase 4 — Better TTS (on hold — paused, not started)
- **Piper only** (self-hosted, free, runs client-side, no per-character cost)
  behind the existing `TtsEngine` seam (`agent/src/renderer/audio/ttsPlayback.ts`)
  — no protocol/UI rewrite needed. `assistant_audio` in the WS protocol was
  only ever needed for a *server-generated* audio path, which Piper-on-the-client
  doesn't use at all.
- **Eliminated during a 2026-08-11 cost audit, do not revisit without a plan
  for the cost:** ElevenLabs (free tier is ~10 min/month *total*, shared
  across every user on one key, and carries no commercial license — a bad
  fit for a multi-tenant free product without a BYOK escape valve or someone
  paying for a plan) and Groq TTS/Orpheus (real per-character cost, ~$22/1M
  characters, and Preview-tier on Groq's side — the same status the vision
  model had right before it got decommissioned mid-project).
- **Why after tools, not before:** upgrades perceived quality once people are
  already using it daily; low value if nobody's retained yet.
- **On hold:** paused by explicit choice, not started — pick this back up
  when there's bandwidth to actually scope the Piper packaging work
  (bundling a Windows binary + voice model into the installer).

## Phase 5 — Wake word (hands-free)
- **`openWakeWord`** (free, open-source, no user caps) via the
  `WakeWordTriggerSource` seam already defined (`agent/src/main/wakeword/`).
  Needs a **custom-trained** "Hey Karvix" model via openWakeWord's own free
  training pipeline — not one of its pre-built demo keywords ("Alexa," "Hey
  Jarvis"), whose official pre-trained weights are CC-BY-NC-SA (non-commercial,
  trained on datasets with restrictive licensing) and can't be shipped in a
  real product. A model trained from scratch on your own data doesn't carry
  that restriction — one-time training-compute cost, not a recurring fee.
- **Eliminated during the same 2026-08-11 cost audit:** Porcupine (the
  original plan) — its free tier caps out at 3 active users/month *total*,
  useless past early testing for a real multi-tenant product, and a custom
  wake word specifically requires its paid Enterprise tier (starts at
  $6,000/year). openWakeWord doesn't gate custom keywords behind payment at
  all, which also happens to be exactly what this phase needs anyway.
- Keep the hotkey as a fallback/manual override.
- **Why this late:** always-on listening is a bigger consent/privacy surface on a
  hosted multi-tenant product than push-to-talk — do this after trust is earned,
  not before.

## Phase 6 — Task queue for long actions
- BullMQ + Redis (Upstash, already in use) so actions like "summarize this PDF and
  email it to me" don't block the conversation loop.
- **Why this late:** nothing in the tool set before Phase 3's later entries is
  actually long-running — building this earlier solves a problem that doesn't
  exist yet.

## Phase 7 — Mobile companion (Android)
- Thin React Native client talking to the same backend (auth/session design
  already supports this — see `docs/ARCHITECTURE.md`).
- Automation scope is smaller on Android (Accessibility Service + Intents, not full
  OS control) — chat + notifications + limited actions are realistic; full parity
  with desktop is not.
- **Why last:** a new client surface and a new automation model, worth the cost
  only once desktop retention is validated.

## Explicitly not planned soon
- iOS automation (Apple's sandboxing makes this impractical).
- Arbitrary shell command execution from voice (security decision, see
  `docs/ARCHITECTURE.md`).
- Stripe/paid billing before the BYOK + waitlist-cap combo is visibly limiting
  growth (see `docs/ARCHITECTURE.md` "Cost control").

---
*This file gets reordered/updated as priorities shift — treat it as living, not fixed.*
