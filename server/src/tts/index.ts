import { env } from "../env.js";
import { redis } from "../redis.js";
import { SpeechService } from "./speechService.js";

function monthKey(): string {
  return `tts:chars:${new Date().toISOString().slice(0, 7)}`; // YYYY-MM (UTC)
}

// Process-wide instance (the cache is shared across sessions — confirmations/errors repeat a lot).
export const speech = new SpeechService({
  apiKey: env.googleTtsApiKey,
  voice: env.ttsVoice,
  monthlyCharCap: env.ttsMonthlyCharCap,
  addMonthlyChars: async (chars) => {
    const key = monthKey();
    await redis.set(key, 0, "EX", 60 * 60 * 24 * 40, "NX");
    return redis.incrby(key, chars);
  },
});
