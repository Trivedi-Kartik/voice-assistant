---
name: add-language
description: Add or change a supported UI/voice language across server/ and agent/. Use when asked to support a new language or to fix a translation or yes/no keyword list.
---

# Adding a language

The language list is hand-duplicated in both packages, and a language touches STT, the LLM prompt, spoken server messages, spoken confirmations, the UI and TTS. Missing one leaves a language that half-works.

**First, confirm the scope decision with the user.** The list is deliberately limited to the 8 languages the LLM is officially validated on (`en hi es fr de it pt th`); tool-calling reliability is already a soft spot in English. A new language is a quality risk, not just a translation chore — see "Multi-language support" in `docs/ARCHITECTURE.md`.

## Server (`server/src/i18n/`)
1. `languages.ts` — add to `SUPPORTED_LANGUAGES` and `LANGUAGE_NAMES` (English name; used in the LLM prompt). The code must be a valid Whisper/ISO-639-1 code — it is passed straight to STT.
2. `messages.ts` — every field of the `Messages` interface (compile error if one is missing).
3. `confirmation.ts` — `YES_WORDS` and `NO_WORDS` entries. Matching is deliberately simple keywords (not an LLM); include natural short forms people actually say. Unclear defaults to "no".
4. `confirmationPrompts.ts` — a prompt for each confirmation-gated tool (`close_app`, `read_clipboard`, `take_screenshot_and_describe`, `add_custom_app`, `computer_use_task`).

## Agent (`agent/src/renderer/i18n/` and audio)
5. `languages.ts` — `SUPPORTED_LANGUAGES` and `LANGUAGE_NATIVE_NAMES` (shown in the picker, in the language's own script).
6. New `dictionaries/<code>.ts` typed against the `Dictionary` in `types.ts`, registered in `i18n/index.ts` `DICTIONARIES`.
7. `audio/ttsPlayback.ts` — add the BCP-47 locale to `BCP47_LOCALE`; also check `agent/src/main/tts/nativeTts.ts` (Linux speech-dispatcher) handles the code.

## Verify
- `grep -rn '"th"' server/src agent/src` (substitute an existing code, e.g. Thai) and compare with the new code's hits — any file with a Thai entry but no entry for the new language is a missed touch point.
- `cd server && npm run typecheck && npm test`; `cd agent && npm run typecheck`.
- Machine-translated strings need native review before shipping; say so in the changelog. Finish with `log-change`.
