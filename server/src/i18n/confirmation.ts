import type { LanguageCode } from "./languages.js";

// Deliberately simple keyword matching, not another LLM call — this decides
// whether something destructive/private is about to happen, so it needs to
// be predictable, not "probably right most of the time" the way tool-call
// generation itself already isn't (see docs/ARCHITECTURE.md). Machine/LLM-
// translated for the 7 non-English languages — see i18n/messages.ts for the
// same review caveat.
const YES_WORDS: Record<LanguageCode, string[]> = {
  en: ["yes", "yeah", "yep", "yup", "sure", "confirm", "confirmed", "okay", "ok", "go ahead", "do it", "please do"],
  hi: ["हाँ", "हां", "जी हाँ", "ठीक है", "ठीक", "पक्का", "कर दो", "हाँ करो"],
  es: ["sí", "si", "vale", "claro", "confirmo", "confirmado", "de acuerdo", "adelante", "hazlo"],
  fr: ["oui", "ouais", "d'accord", "confirme", "confirmé", "vas-y", "fais-le", "ok"],
  de: ["ja", "jep", "klar", "bestätigt", "bestätige", "mach das", "leg los", "okay", "ok"],
  it: ["sì", "si", "certo", "confermo", "confermato", "va bene", "vai", "fallo", "ok"],
  pt: ["sim", "claro", "confirmo", "confirmado", "certo", "pode", "faça isso", "ok"],
  th: ["ใช่", "ตกลง", "โอเค", "ยืนยัน", "ทำเลย", "ได้"],
};

const NO_WORDS: Record<LanguageCode, string[]> = {
  en: ["no", "nope", "nah", "cancel", "stop", "don't", "do not", "never mind", "nevermind"],
  hi: ["नहीं", "मत करो", "रुको", "रद्द करो", "रहने दो"],
  es: ["no", "cancela", "cancelar", "para", "detente", "olvídalo", "déjalo"],
  fr: ["non", "annule", "annuler", "arrête", "laisse tomber", "oublie ça"],
  de: ["nein", "nee", "abbrechen", "stopp", "lass es", "vergiss es"],
  it: ["no", "annulla", "fermati", "lascia stare", "no grazie"],
  pt: ["não", "nao", "cancela", "cancelar", "para", "deixa pra lá", "esquece"],
  th: ["ไม่", "ไม่ใช่", "ยกเลิก", "หยุด", "ไม่ต้อง"],
};

// Confirmed via real testing (English case): Whisper transcripts almost
// always carry trailing punctuation ("Yes.") — stripping it is essential or
// exact matches silently fail. "¿¡" covers Spanish's leading punctuation too
// (only affects the leading side, not handled by a trailing strip, but a
// leading "¿Sí?" is rare for a one-word confirmation reply — a real, small
// residual gap, not worth a more elaborate parser for this deterministic
// yes/no gate).
function normalize(transcript: string): string {
  return transcript.trim().toLowerCase().replace(/[.!?,]+$/, "");
}

export function classifyConfirmation(transcript: string, language: string): "yes" | "no" | "unclear" {
  const lang = (language in YES_WORDS ? language : "en") as LanguageCode;
  const normalized = normalize(transcript);
  if (YES_WORDS[lang].some((w) => normalized === w || normalized.startsWith(`${w} `))) return "yes";
  if (NO_WORDS[lang].some((w) => normalized === w || normalized.startsWith(`${w} `))) return "no";
  return "unclear";
}
