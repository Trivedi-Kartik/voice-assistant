// Mirrors server/src/i18n/languages.ts by hand — same reasoning as
// TOOL_NAMES's cross-package duplication (see server/src/tools/toolNames.ts):
// agent/ and server/ are separately built/deployed, no clean shared-module
// boundary without a full monorepo workspace. Exactly the 8 languages Meta
// officially validated Llama 3.3 70B on — see server/src/i18n/languages.ts
// for the full reasoning on why this list and not a broader one.
export const SUPPORTED_LANGUAGES = ["en", "hi", "es", "fr", "de", "it", "pt", "th"] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

// Native-script names, for the language picker itself (a person picking their
// own language should see it in that language, not in English).
export const LANGUAGE_NATIVE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  th: "ไทย",
};
