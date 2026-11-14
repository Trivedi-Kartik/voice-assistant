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

// Real bug, found via live testing: a near-silent recording (background
// noise/room hum briefly crossing the client's RMS-based "arm" threshold in
// silenceDetector.ts) reaches Whisper as a short, mostly-empty clip, and
// Whisper hallucinates a token instead of returning "" — observed live as
// transcripts of exactly "." or a single stray letter. ws/session.ts's
// existing `if (!transcript)` guard only catches a literal empty string, so
// these non-empty-but-content-free results were sailing through and starting
// a real turn. This is the same check applied to those results: strip
// everything but letters/digits and require at least 2 remaining — high
// enough to drop "." and single letters, low enough to never reject a real
// short reply like "Yes"/"No"/"Ok" (the confirmation-flow resolutions in
// ws/session.ts route through this exact same transcript path).
const MIN_TRANSCRIPT_ALNUM_CHARS = 2;

export function isTrivialTranscript(transcript: string): boolean {
  const alnumOnly = transcript.replace(/[^\p{L}\p{N}]/gu, "");
  return alnumOnly.length < MIN_TRANSCRIPT_ALNUM_CHARS;
}
