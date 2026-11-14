import { splitIntoSpeechChunks } from "../../shared/speechChunks";
import { SpeechQueue } from "./speechQueue";
import type { TtsEngine } from "./ttsPlayback";

// The app's default voice: the local natural (Kokoro) voice for English, generated sentence by
// sentence in the main process and played through SpeechQueue (ordering, stop, per-chunk fallback).
// Any sentence it can't produce — other languages, model still downloading, an error — is spoken by
// the system voice, so the user always hears the full reply.
export class NaturalVoiceEngine implements TtsEngine {
  // Local synthesis of a sentence takes ~1-3s on a laptop CPU, so wait longer than for server audio.
  private readonly queue: SpeechQueue;
  private generation = 0;

  constructor(private readonly system: TtsEngine) {
    this.queue = new SpeechQueue(system, 20_000, 20_000);
  }

  async speak(text: string, language: string): Promise<void> {
    const generation = ++this.generation;
    const chunks = splitIntoSpeechChunks(text, language);
    if (chunks.length === 0) return;
    const replyId = `local-${generation}-${Date.now()}`;
    const playback = this.queue.speak(text, language, replyId);

    // Produce chunk i while chunk i-1 plays (one ahead), pushing each as soon as it's ready.
    let previous: Promise<void> = Promise.resolve();
    for (let i = 0; i < chunks.length; i++) {
      if (generation !== this.generation) break; // stopped / superseded
      const audio = window.jarvis.voice.synthesize(chunks[i], language).catch(() => null);
      previous = previous.then(async () => {
        const data = await audio;
        if (generation !== this.generation) return;
        this.queue.push({
          replyId,
          seq: i,
          final: i === chunks.length - 1,
          text: chunks[i],
          ...(data ? { data, mimeType: "audio/wav" } : {}),
        });
      });
      await audio; // keep at most one synthesis request ahead of what's been queued
    }
    await playback;
  }

  stop(): void {
    this.generation++;
    this.queue.stop();
  }
}
