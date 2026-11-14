// Runs in an Electron utility process (its own OS process): speech synthesis is CPU-heavy and
// synchronous, and doing it in the main process would freeze the whole app (window, IPC, hotkey).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sherpa = require("sherpa-onnx-node");

interface InitMessage {
  type: "init";
  paths: { model: string; voices: string; tokens: string; dataDir: string; lexicon: string; dictDir: string };
  numThreads: number;
}
interface SynthMessage {
  type: "synth";
  id: number;
  text: string;
  lang: string; // espeak-ng code, e.g. "en-us", "hi", "pt-br"
  speaker: number;
  speed: number;
}

let init: InitMessage | null = null;
// One loaded engine at a time (the model is ~350 MB in memory); rebuilt only when the language changes,
// which is rare (it's a per-user setting).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tts: any = null;
let ttsLang = "";

function engineFor(lang: string) {
  if (tts && ttsLang === lang) return tts;
  if (!init) throw new Error("not_initialized");
  tts = new sherpa.OfflineTts({
    model: {
      kokoro: { ...init.paths, lang },
      numThreads: init.numThreads,
      provider: "cpu",
      debug: false,
    },
    maxNumSentences: 1,
  });
  ttsLang = lang;
  return tts;
}

function toWav(samples: Float32Array, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

const port = (process as unknown as { parentPort: { on: (e: string, cb: (m: { data: unknown }) => void) => void; postMessage: (m: unknown) => void } }).parentPort;

port.on("message", ({ data }) => {
  const msg = data as InitMessage | SynthMessage;
  try {
    if (msg.type === "init") {
      init = msg;
      engineFor("en-us"); // load eagerly so the first reply isn't delayed by model loading
      port.postMessage({ type: "ready" });
      return;
    }
    if (msg.type === "synth") {
      // enableExternalBuffer:false — Electron's V8 memory cage rejects N-API external buffers ("External
      // buffers are not allowed"), so have the addon copy samples into a normal buffer instead.
      const audio = engineFor(msg.lang).generate({ text: msg.text, sid: msg.speaker, speed: msg.speed, enableExternalBuffer: false });
      port.postMessage({ type: "audio", id: msg.id, wav: toWav(audio.samples, audio.sampleRate).toString("base64") });
    }
  } catch (err) {
    port.postMessage({ type: "error", id: (msg as SynthMessage).id, message: (err as Error).message });
  }
});
