import Groq, { toFile } from "groq-sdk";
import { isGroqRateLimit, sleep } from "./groqErrors.js";

const MAX_STT_RETRIES = 3;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;

// Whisper isn't a streaming ASR API — the client streams audio chunks as they're
// captured (for low tail latency), but the server buffers/concatenates them per
// utterance and calls Whisper once, on `audio_end`. See docs/ARCHITECTURE.md.
//
// Only retries on rate limits — a genuinely corrupted/invalid audio file (Groq's
// "could not process file") will just fail identically on retry, so that's left
// to bubble up and get a distinct, actionable message in ws/session.ts instead.
export async function transcribeAudio(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const groq = new Groq({ apiKey });
  for (let attempt = 1; ; attempt++) {
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: await toFile(audioBuffer, "utterance.webm"),
        model: "whisper-large-v3",
      });
      return transcription.text.trim();
    } catch (err) {
      if (attempt >= MAX_STT_RETRIES || !isGroqRateLimit(err)) throw err;
      console.error(`[stt] retrying after rate limit (attempt ${attempt})`, err);
      await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    }
  }
}
