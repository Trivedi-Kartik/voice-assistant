// Exactly the 8 languages Meta officially validated Llama 3.3 70B on (our
// Groq model, see llm.ts) — Whisper and TTS both support far more, but the
// LLM is the real bottleneck: it decides intent and which tool to call, and
// tool-calling reliability is already a soft spot in English alone (see
// docs/ARCHITECTURE.md "Known reliability limitation"). Going beyond this
// list means unmeasured risk with no way to test for it upfront, so this is
// a hard scope boundary, not an arbitrary pick. Codes are Whisper/ISO-639-1,
// used as-is for STT's `language` param — no translation table needed there.
export const SUPPORTED_LANGUAGES = ["en", "hi", "es", "fr", "de", "it", "pt", "th"] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string): value is LanguageCode {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

// English names, for injecting into the LLM system prompt directive (see
// ws/session.ts buildSystemPrompt) — not user-facing UI copy.
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  th: "Thai",
};
