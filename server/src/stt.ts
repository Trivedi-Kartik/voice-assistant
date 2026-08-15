import Groq, { toFile } from "groq-sdk";
import { isGroqRateLimit, getRetryAfterSeconds, sleep } from "./groqErrors.js";

const MAX_STT_RETRIES = 3;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;
// Same reasoning as llm.ts: a long wait means a quota reset, not a momentary
// burst — retrying every 1.5s against a 10-minute reset is pointless.
const MAX_SHORT_RATE_LIMIT_WAIT_SECONDS = 5;

// Whisper isn't a streaming ASR API — the client streams audio chunks as they're
// captured (for low tail latency), but the server buffers/concatenates them per
// utterance and calls Whisper once, on `audio_end`. See docs/ARCHITECTURE.md.
//
// Only retries on rate limits — a genuinely corrupted/invalid audio file (Groq's
// "could not process file") will just fail identically on retry, so that's left
// to bubble up and get a distinct, actionable message in ws/session.ts instead.
export async function transcribeAudio(apiKey: string, audioBuffer: Buffer, language: string): Promise<string> {
  const groq = new Groq({ apiKey });
  for (let attempt = 1; ; attempt++) {
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: await toFile(audioBuffer, "utterance.webm"),
        model: "whisper-large-v3",
        // Real bug, reported from live use: with no language hint, Whisper
        // auto-detects the spoken language from the audio — and that
        // detection can misfire on accented speech (a known Whisper failure
        // mode), producing a transcript in an entirely different
        // language/script than intended. Always force it explicitly from the
        // user's own selected language (see i18n/languages.ts) rather than
        // trusting per-utterance detection — same reasoning as the original
        // English-only fix, just generalized to all 8 supported languages.
        language,
      });
      return transcription.text.trim();
    } catch (err) {
      const rateLimited = isGroqRateLimit(err);
      const retryAfter = rateLimited ? getRetryAfterSeconds(err) : null;
      const isLongWait = retryAfter !== null && retryAfter > MAX_SHORT_RATE_LIMIT_WAIT_SECONDS;

      if (isLongWait || attempt >= MAX_STT_RETRIES || !rateLimited) throw err;
      console.error(`[stt] retrying after rate limit (attempt ${attempt})`, err);
      await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    }
  }
}
