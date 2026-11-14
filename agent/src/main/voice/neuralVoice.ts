import { utilityProcess, type UtilityProcess } from "electron";
import os from "node:os";
import path from "node:path";
import { ensureModel, isModelInstalled, modelPaths } from "./voiceModel.js";

// Local natural voice (en, hi, es, fr, it, pt). Owns the synthesis utility process and serializes requests to it.
// Every failure mode resolves to `null`, which tells the renderer to use the system voice instead.

// App language -> espeak-ng code + Kokoro v1.0 speaker id (ids read from the model's own metadata).
// Codes are the ones verified to work: "en-gb" and "fr-fr" crash the engine, so they're never used.
// German and Thai have no Kokoro voice -> system voice.
const VOICES: Record<string, { lang: string; speaker: number }> = {
  en: { lang: "en-us", speaker: 3 }, // af_heart — Kokoro's best-rated voice
  hi: { lang: "hi", speaker: 31 }, // hf_alpha
  es: { lang: "es", speaker: 28 }, // ef_dora
  fr: { lang: "fr", speaker: 30 }, // ff_siwis
  it: { lang: "it", speaker: 35 }, // if_sara
  pt: { lang: "pt-br", speaker: 42 }, // pf_dora
};
const MAX_RESTARTS = 3;
const SYNTH_TIMEOUT_MS = 20_000;
const MAX_TEXT = 1000;

type Pending = { resolve: (wav: string | null) => void; timer: NodeJS.Timeout };

class NeuralVoice {
  private proc: UtilityProcess | null = null;
  private ready = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private restarts = 0;

  // Call once at startup. Downloads the model in the background if needed, then starts the worker.
  start(): void {
    ensureModel()
      .then(() => this.spawn())
      .catch((err) => console.warn("[voice] natural voice unavailable, using system voice:", err.message));
  }

  get available(): boolean {
    return this.ready;
  }

  private spawn(): void {
    if (this.proc || !isModelInstalled()) return;
    const proc = utilityProcess.fork(path.join(__dirname, "neuralVoiceWorker.js"), [], { serviceName: "Karvix voice" });
    this.proc = proc;
    proc.on("message", (msg: { type: string; id?: number; wav?: string; message?: string }) => {
      if (msg.type === "ready") {
        this.ready = true;
        console.log("[voice] natural voice ready");
        return;
      }
      const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id!);
      if (msg.type === "error") console.warn("[voice] synthesis failed:", msg.message);
      p.resolve(msg.type === "audio" ? (msg.wav ?? null) : null);
    });
    proc.on("exit", (code) => {
      console.warn("[voice] worker exited", code);
      this.proc = null;
      this.ready = false;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.resolve(null);
      }
      this.pending.clear();
      // A native crash only takes down this helper process; bring it back a few times, then stay on
      // the system voice for the rest of the session rather than crash-looping.
      if (this.restarts < MAX_RESTARTS) {
        this.restarts++;
        setTimeout(() => this.spawn(), 2000 * this.restarts);
      }
    });
    // One thread per physical core was fastest in testing (hyper-threads made it slower).
    const numThreads = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
    proc.postMessage({ type: "init", paths: modelPaths(), numThreads });
  }

  // Returns base64 WAV, or null => caller uses the system voice.
  synthesize(text: string, language: string): Promise<string | null> {
    const voice = VOICES[language];
    if (!voice || !this.ready || !this.proc) return Promise.resolve(null);
    const clean = text.slice(0, MAX_TEXT).trim();
    if (!clean) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, SYNTH_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      this.proc!.postMessage({ type: "synth", id, text: clean, lang: voice.lang, speaker: voice.speaker, speed: 1.0 });
    });
  }
}

export const neuralVoice = new NeuralVoice();
