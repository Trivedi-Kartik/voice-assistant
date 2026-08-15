import Groq from "groq-sdk";
import type { LanguageCode } from "./i18n/languages.js";

// Shared error classification used by both stt.ts and llm.ts (both call Groq),
// so retry policy and user-facing messaging stay consistent across the two.

export function isGroqRateLimit(err: unknown): boolean {
  return err instanceof Groq.RateLimitError;
}

// Groq's rate-limit errors cover two very different situations that need very
// different handling: a short burst/per-minute limit (worth a quick retry) vs a
// daily token quota exhausted for hours (retrying every second is pointless —
// confirmed via real testing where 6 retries all failed identically because the
// reset was ~10 minutes away). `retry-after` (seconds) tells us which is which.
export function getRetryAfterSeconds(err: unknown): number | null {
  if (!(err instanceof Groq.APIError)) return null;
  const raw = (err.headers as Record<string, string | undefined> | undefined)?.["retry-after"];
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) ? seconds : null;
}

// Localized duration phrase for rateLimitMessage() (ws/session.ts) — the
// number is embedded in an already-localized sentence, so just the unit
// words need translating. Machine/LLM-translated, same review caveat as
// i18n/messages.ts.
const DURATION_WORDS: Record<LanguageCode, { seconds: (n: number) => string; minutes: (n: number) => string }> = {
  en: { seconds: (n) => `${n} seconds`, minutes: (n) => `${n} minute${n === 1 ? "" : "s"}` },
  hi: { seconds: (n) => `${n} सेकंड`, minutes: (n) => `${n} मिनट` },
  es: { seconds: (n) => `${n} segundos`, minutes: (n) => `${n} minuto${n === 1 ? "" : "s"}` },
  fr: { seconds: (n) => `${n} secondes`, minutes: (n) => `${n} minute${n === 1 ? "" : "s"}` },
  de: { seconds: (n) => `${n} Sekunden`, minutes: (n) => `${n} Minute${n === 1 ? "" : "n"}` },
  it: { seconds: (n) => `${n} secondi`, minutes: (n) => `${n} minuto${n === 1 ? "" : "i"}` },
  pt: { seconds: (n) => `${n} segundos`, minutes: (n) => `${n} minuto${n === 1 ? "" : "s"}` },
  th: { seconds: (n) => `${n} วินาที`, minutes: (n) => `${n} นาที` },
};

export function formatWaitTime(seconds: number, language: string): string {
  const words = DURATION_WORDS[language as LanguageCode] ?? DURATION_WORDS.en;
  if (seconds < 60) return words.seconds(Math.ceil(seconds));
  return words.minutes(Math.ceil(seconds / 60));
}

// Confirmed via real, repeated testing (not hypothetical) on Llama 3.3, this
// app's model until Groq decommissioned it on 2026-08-16 (see llm.ts): it
// occasionally generated a malformed tool call — literally
// `<function=open_app{...}</function>` pseudo-XML instead of a proper
// structured call — and Groq's API rejects the whole completion with a 400
// `tool_use_failed` before it ever reaches us. Generation-quality noise, not a
// deterministic bug: identical requests succeeded on retry most of the time.
// Kept this retry on the new model (openai/gpt-oss-120b) since the failure
// mode is API-shape-level, not model-specific, but the actual failure rate is
// unverified on the new model — re-check via real usage.
export function isRetryableToolUseFailure(err: unknown): boolean {
  if (!(err instanceof Groq.APIError) || err.status !== 400) return false;
  const body = err.error as { error?: { code?: string } } | undefined;
  return body?.error?.code === "tool_use_failed";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
