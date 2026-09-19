# Capability Matrix (Phase 0)

Every currently-shipped capability, classified per the Phase 0 prompt's categories: **preserve as-is for now**, **wrap as a tool**, **refactor**, **replace later**, **platform-specific**. A capability can carry more than one tag (e.g. "wrap as a tool" now, "replace later" once a better mechanism exists).

| Capability | Where implemented | Classification | Notes |
|---|---|---|---|
| Signup/login/logout | `server/src/auth/routes.ts` | Preserve as-is | Solid crypto/rotation properties; only gaps are additive (rate limiting, password reset), not correctness issues |
| Refresh token rotation + theft detection | `server/src/auth/refreshTokens.ts` | Preserve as-is | Do not touch without a specific finding |
| WS ticket exchange | `server/src/auth/wsTicket.ts`, `ws/server.ts` | Preserve as-is | |
| BYOK Groq key (encrypt/store/resolve) | `server/src/groqKey.ts`, `crypto.ts` | Preserve as-is | Cost model depends on this exactly as built |
| Daily turn cap / shared-key quota | `server/src/rateLimit.ts` | Preserve as-is, refactor later | Works; `recordUsage`'s token/STT-second fields are unpopulated dead weight worth cleaning up whenever this file is next touched |
| Per-user concurrency lock | `server/src/ws/userLock.ts` | Refactor (before any horizontal scaling) | In-memory only; must move to Redis before more than one server process ever runs |
| Push-to-talk hotkey trigger | `agent/src/main/hotkey/` | Preserve as-is | `TriggerSource` abstraction already supports a second (wake-word) implementation without changes here |
| Continuous conversation (always-on resume, silence detection) | `agent/src/renderer/App.tsx`, `audio/silenceDetector.ts` | Preserve as-is, needs real-hardware tuning | Mechanism is sound; RMS thresholds are unverified against varied real mic/room conditions per its own code comments |
| Speech-to-text | `server/src/stt.ts` (Groq Whisper) | Wrap as a tool (behind a model router) | Currently a direct Groq SDK call; needs a provider seam before any local-STT phase |
| Text-to-speech (browser + Linux native) | `agent/src/renderer/audio/ttsPlayback.ts`, `main/tts/nativeTts.ts` | Preserve as-is | `TtsEngine` interface already supports a future Piper swap with zero UI change |
| Tool-calling LLM loop | `server/src/llm.ts`, `ws/session.ts` | Refactor + wrap as a tool (model router) | The core extraction target for Phase 1; direct Groq SDK call today |
| `open_app` | `agent/src/main/tools/openApp.ts` + `appRegistry.*` | Wrap as a tool, platform-specific | Already effectively a well-shaped tool; just needs the typed-skill wrapper |
| `close_app` | `agent/src/main/tools/closeApp.ts` | Wrap as a tool, platform-specific | Confirmation-gated; keep that behavior |
| `web_search` / `open_url` | `agent/src/main/tools/webSearch.ts`, `openUrl.ts` | Wrap as a tool, replace later | Correct today; superseded in capability (not removed) once a real browser runtime exists for tasks that need to *read* results, not just open a tab |
| `control_media` | `agent/src/main/tools/controlMedia.ts` | Wrap as a tool, platform-specific | Windows-only; no Linux equivalent exists at all (real gap, not yet tracked as one anywhere) |
| `set_reminder` | `agent/src/main/reminders/` | Wrap as a tool | Client-local by design; would need a durable/server-backed redesign before cross-device (Phase 10), not before |
| `read_clipboard` | `agent/src/main/tools/readClipboard.ts` | Wrap as a tool | Confirmation-gated; keep |
| `take_screenshot_and_describe` | `agent/src/main/tools/takeScreenshot.ts`, `server/src/vision.ts` | Wrap as a tool | Confirmation-gated; the vision-model constant just broke in production once already this month — see `RISK_REGISTER.md` |
| `add_custom_app` | `agent/src/main/tools/addCustomApp.*` | Preserve as-is, platform-specific | Genuinely well-designed input-safety model (never free text into a command); keep this exact discipline in any future skill wrapper |
| `remember_preference` (memory write) | `server/src/ws/session.ts` (server-handled tool), `memory/memoryStore.ts` | Wrap as a tool | Deliberately explicit-only write policy — preserve this exact constraint, don't let a future "smarter" memory system start passively scanning conversations without a deliberate, documented decision to change that |
| Memory retrieval (RAG injection) | `server/src/ws/session.ts`, `memory/memoryStore.ts` | Refactor | Currently unconditional every-turn injection with no tool-based recall option; a real memory-architecture phase (master doc §15) will want retrieval strategies beyond vector-only |
| `computer_use_task` (screenshot-click automation) | `server/src/automation/`, `agent/src/main/tools/computerUse/` | Preserve as fallback tier, do not expand scope yet | Correctly scoped as *a* tool the model can choose, but currently the *only* execution tier for any browser/desktop task beyond the 9 above — see "replace later" entry for browser tasks specifically |
| Browser-task execution (currently: computer-use only) | n/a — doesn't exist as a separate tier | Replace later | No DOM/accessibility/API tier exists at all; this is the single highest-value new capability for the exact "Amazon add-to-cart"-style task that motivated computer-use in the first place |
| Consent screen / privacy policy | `agent/src/renderer/components/ConsentScreen.tsx`, `server/src/privacyPolicy.ts` | Preserve as-is | Explicit, affirmative, separate from OS mic permission — keep this bar for any new consequential capability |
| Custom app storage, reminders, consent, device id (local persistence) | `agent/src/main/*/*.ts` (`electron-store`-backed) | Preserve as-is | Consistent one-store-per-concern pattern; fine to keep using for anything that stays genuinely device-local |
| Auto-update | `agent/src/main/updater/autoUpdate.ts` | Preserve as-is | Conversation-aware deferral logic is already correct and non-trivial; don't casually simplify it |
| Packaging (NSIS + AppImage) | `agent/electron-builder.yml` | Preserve as-is | AppImage sandbox limitation is a documented, accepted, unfixable-in-app platform constraint — not something to "fix" in a future phase without a genuinely new mechanism (e.g. a `.deb`/`.rpm` target) |
| i18n (8 languages, client + server mirrors) | `*/i18n/` | Preserve as-is, refactor later | Works; the hand-duplicated language list is a minor, low-urgency case of the broader cross-package duplication issue |

## Explicitly out of scope for reclassification right now

Per the Phase 0 rules, nothing above is being changed in this phase. This table exists to inform `IMPLEMENTATION_ROADMAP.md`'s ordering, not to authorize any of these actions yet.
