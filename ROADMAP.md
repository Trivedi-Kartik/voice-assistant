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

### Next
- Low-risk: `set_reminder`, `control_media` (play/pause/volume).
- Then moderate: `read_clipboard`, `take_screenshot_and_describe`.
- Higher-risk last, each with its own mini privacy review before shipping:
  `send_email_draft` (Gmail API, OAuth, careful scoping).
- Each new tool still follows the strict-whitelist rule from `docs/ARCHITECTURE.md`
  and ships as its own reviewed increment, not a single "Phase 3 dump."

## Phase 4 — Better TTS
- Swap browser `SpeechSynthesis` for **Piper** (self-hosted, free, more natural) or
  ElevenLabs free tier, behind the existing `TtsEngine` seam
  (`agent/src/renderer/audio/ttsPlayback.ts`) — no protocol/UI rewrite needed.
- **Why after tools, not before:** upgrades perceived quality once people are
  already using it daily; low value if nobody's retained yet.

## Phase 5 — Wake word (hands-free)
- Integrate Porcupine (free tier, offline, low-latency) via the
  `WakeWordTriggerSource` seam already defined (`agent/src/main/wakeword/`).
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
