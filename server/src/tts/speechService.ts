import type { ServerMessage } from "../protocol.js";
import { splitIntoSpeechChunks } from "./sentences.js";
import { synthesizeSpeech, TTS_MIME_TYPE } from "./googleTts.js";

// Turns an assistant reply into a stream of `assistant_audio` messages, one per speech chunk, in order.
// Every message carries its chunk's text, so whenever audio is missing (TTS not configured, quota
// reached, provider error/timeout) the client simply speaks that chunk with its local voice — the
// user always hears the whole reply, just in a different voice for the affected part.

export interface SpeechDeps {
  apiKey?: string;
  voice: string;
  monthlyCharCap: number;
  // Atomically adds `chars` to this month's counter and returns the new total.
  addMonthlyChars: (chars: number) => Promise<number>;
  synthesize?: (text: string, language: string) => Promise<Buffer>;
}

const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_TEXT = 200; // only short, repeated phrases (confirmations, errors, "Done") are worth caching
const PREFETCH = 2; // chunks synthesized ahead of the one currently being sent

export class SpeechService {
  private readonly cache = new Map<string, Buffer>();
  private readonly synth: (text: string, language: string) => Promise<Buffer>;

  constructor(private readonly deps: SpeechDeps) {
    this.synth =
      deps.synthesize ??
      ((text, language) => synthesizeSpeech(text, language, { apiKey: deps.apiKey!, voice: deps.voice }));
  }

  get enabled(): boolean {
    return Boolean(this.deps.apiKey) || Boolean(this.deps.synthesize);
  }

  async stream(text: string, language: string, replyId: string, send: (msg: ServerMessage) => void): Promise<void> {
    const chunks = splitIntoSpeechChunks(text, language);
    if (chunks.length === 0) {
      send({ type: "assistant_audio", replyId, seq: 0, final: true, text: "" });
      return;
    }
    const pending: Promise<Buffer | null>[] = [];
    const start = (i: number) => {
      if (i < chunks.length && pending[i] === undefined) pending[i] = this.audioFor(chunks[i], language);
    };
    for (let i = 0; i < chunks.length; i++) {
      for (let j = i; j <= i + PREFETCH; j++) start(j);
      const audio = await pending[i];
      send({
        type: "assistant_audio",
        replyId,
        seq: i,
        final: i === chunks.length - 1,
        text: chunks[i],
        ...(audio ? { data: audio.toString("base64"), mimeType: TTS_MIME_TYPE } : {}),
      });
    }
  }

  // null = no audio for this chunk (client falls back to its local voice for it).
  private async audioFor(text: string, language: string): Promise<Buffer | null> {
    const key = `${this.deps.voice}|${language}|${text}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key); // refresh LRU position
      this.cache.set(key, hit);
      return hit;
    }
    try {
      // Stay inside the provider's free tier: stop synthesizing once this month's budget is spent.
      const total = await this.deps.addMonthlyChars(text.length);
      if (total > this.deps.monthlyCharCap) return null;
      const audio = await this.synth(text, language);
      if (text.length <= CACHE_MAX_TEXT) {
        this.cache.set(key, audio);
        if (this.cache.size > CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
      }
      return audio;
    } catch (err) {
      console.error("[tts] synthesis failed, client will use its local voice:", (err as Error).message);
      return null;
    }
  }
}
