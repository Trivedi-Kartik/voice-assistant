import type { SpeechChunk } from "../jarvis";
import type { TtsEngine } from "./ttsPlayback";

// Plays one reply's server-synthesized speech chunks gaplessly and in order (they can arrive out of
// order or late). A chunk without audio — or one that fails to decode — is spoken with the local voice,
// so the user always hears the whole reply. Uses Web Audio (decode from bytes), which works under the
// app's strict CSP (no data:/blob: media URLs needed).
//
// Timeouts guarantee `speak()` always resolves: if the server's audio never starts arriving, the whole
// reply is spoken locally; if it stalls mid-reply, playback ends with what was received.
const FIRST_CHUNK_TIMEOUT_MS = 4000;
const NEXT_CHUNK_TIMEOUT_MS = 8000;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class SpeechQueue {
  private ctx: AudioContext | null = null;
  // Buffered chunks, keyed by "replyId:seq".
  private chunks = new Map<string, SpeechChunk>();
  private currentReply: string | null = null;
  private wake: (() => void) | null = null;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;

  constructor(private readonly fallback: TtsEngine) {}

  // Called when assistant_text arrives with audioFollows. Resolves when the reply has finished playing
  // (or was stopped).
  async speak(fullText: string, language: string, replyId: string): Promise<void> {
    const generation = ++this.generation;
    const live = () => generation === this.generation;
    this.currentReply = replyId;
    // Drop leftovers from any earlier reply (e.g. one the user stopped mid-way).
    for (const key of [...this.chunks.keys()]) if (!key.startsWith(`${replyId}:`)) this.chunks.delete(key);
    let next = 0;
    let receivedAny = this.chunks.size > 0;

    while (live()) {
      const key = `${replyId}:${next}`;
      const chunk = this.chunks.get(key) ?? (await this.waitFor(key, receivedAny ? NEXT_CHUNK_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS));
      if (!live()) return;
      if (!chunk) {
        // Timed out. Nothing arrived at all -> say the whole reply locally; otherwise stop here.
        if (!receivedAny) await this.fallback.speak(fullText, language);
        break;
      }
      receivedAny = true;
      this.chunks.delete(key);
      if (chunk.text) await this.playChunk(chunk, language, live);
      if (chunk.final) break;
      next++;
    }
    if (live()) {
      this.chunks.clear();
      this.currentReply = null;
    }
  }

  // assistant_audio chunk from the server. Chunks for a reply may arrive before speak() is called
  // (assistant_text and the first audio race over IPC) — they're buffered.
  push(chunk: SpeechChunk): void {
    // Ignore chunks for a reply that already finished or was stopped; buffer the current/next one.
    if (this.stoppedReplies.has(chunk.replyId)) return;
    this.chunks.set(`${chunk.replyId}:${chunk.seq}`, chunk);
    this.wake?.();
  }

  // Replies the user stopped — their late chunks are discarded on arrival (bounded set).
  private readonly stoppedReplies = new Set<string>();

  // A reply that won't be played (user already ended the session): drop its chunks now and on arrival.
  discard(replyId: string): void {
    this.stoppedReplies.add(replyId);
    for (const key of [...this.chunks.keys()]) if (key.startsWith(`${replyId}:`)) this.chunks.delete(key);
  }

  stop(): void {
    if (this.currentReply) {
      this.stoppedReplies.add(this.currentReply);
      if (this.stoppedReplies.size > 50) this.stoppedReplies.delete(this.stoppedReplies.values().next().value!);
    }
    this.currentReply = null;
    this.generation++;
    this.chunks.clear();
    this.wake?.();
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
    this.fallback.stop();
  }

  private waitFor(key: string, timeoutMs: number): Promise<SpeechChunk | undefined> {
    const generation = this.generation;
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve(generation === this.generation ? this.chunks.get(key) : undefined);
      };
      const timer = setTimeout(done, timeoutMs);
      this.wake = () => {
        if (this.chunks.has(key) || generation !== this.generation) done(); // arrived, or stop() was called
      };
    });
  }

  private async playChunk(chunk: SpeechChunk, language: string, live: () => boolean): Promise<void> {
    if (!chunk.data) {
      await this.fallback.speak(chunk.text, language);
      return;
    }
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      const buffer = await this.ctx.decodeAudioData(base64ToArrayBuffer(chunk.data));
      if (!live()) return;
      await new Promise<void>((resolve) => {
        const src = this.ctx!.createBufferSource();
        src.buffer = buffer;
        src.connect(this.ctx!.destination);
        src.onended = () => resolve();
        this.source = src;
        src.start();
      });
      this.source = null;
    } catch (err) {
      console.error("[speech] couldn't play server audio, using local voice", err);
      if (live()) await this.fallback.speak(chunk.text, language);
    }
  }
}
