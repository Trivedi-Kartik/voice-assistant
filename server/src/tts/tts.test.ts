import { describe, expect, it, vi } from "vitest";
import { splitIntoSpeechChunks } from "./sentences.js";
import { synthesizeSpeech, TtsError } from "./googleTts.js";
import { SpeechService } from "./speechService.js";
import type { ServerMessage } from "../protocol.js";

describe("splitIntoSpeechChunks", () => {
  it("splits sentences and merges tiny fragments", () => {
    expect(splitIntoSpeechChunks("Sure. I opened Notepad and created a new file for you. I also saved it on your desktop.", "en")).toEqual([
      "Sure. I opened Notepad and created a new file for you.", // "Sure." is too short to send alone
      "I also saved it on your desktop.",
    ]);
    // A short trailing sentence rides along with the previous chunk instead of costing its own request.
    expect(splitIntoSpeechChunks("I created the file for you. Anything else?", "en")).toEqual(["I created the file for you. Anything else?"]);
  });
  it("splits on the Hindi danda", () => {
    const out = splitIntoSpeechChunks("मैंने नोटपैड खोल दिया है और फ़ाइल सेव कर दी है। क्या कुछ और करना है आपके लिए?", "hi");
    expect(out.length).toBe(2);
  });
  it("cuts long unpunctuated Thai into bounded chunks at spaces", () => {
    const thai = Array(40).fill("สวัสดีครับ").join(" ");
    const out = splitIntoSpeechChunks(thai, "th");
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(300);
    expect(out.join(" ")).toBe(thai);
  });
  it("returns nothing for empty text", () => expect(splitIntoSpeechChunks("   ", "en")).toEqual([]));
});

describe("synthesizeSpeech (Google Chirp 3 HD)", () => {
  it("sends the Chirp 3 HD voice for the user's language and decodes audio", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.voice).toEqual({ languageCode: "hi-IN", name: "hi-IN-Chirp3-HD-Aoede" });
      expect(body.audioConfig.audioEncoding).toBe("MP3");
      return new Response(JSON.stringify({ audioContent: Buffer.from("mp3bytes").toString("base64") }), { status: 200 });
    });
    const out = await synthesizeSpeech("नमस्ते", "hi", { apiKey: "k", voice: "Aoede", fetchImpl: fetchImpl as never });
    expect(out.toString()).toBe("mp3bytes");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("key=k");
  });
  it("throws TtsError with the provider message (no URL/key in it) on failure", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    await expect(synthesizeSpeech("hi", "en", { apiKey: "secret", voice: "Aoede", fetchImpl: fetchImpl as never })).rejects.toSatisfy(
      (e: unknown) => e instanceof TtsError && e.status === 400 && !e.message.includes("secret")
    );
  });
});

function service(opts: { cap?: number; fail?: (t: string) => boolean } = {}) {
  let used = 0;
  const synthesize = vi.fn(async (text: string) => {
    if (opts.fail?.(text)) throw new Error("boom");
    return Buffer.from(`audio:${text}`);
  });
  const svc = new SpeechService({
    voice: "Aoede",
    monthlyCharCap: opts.cap ?? 1_000_000,
    addMonthlyChars: async (n) => (used += n),
    synthesize,
  });
  return { svc, synthesize };
}

async function collect(svc: SpeechService, text: string) {
  const sent: Extract<ServerMessage, { type: "assistant_audio" }>[] = [];
  await svc.stream(text, "en", "r1", (m) => sent.push(m as never));
  return sent;
}

describe("SpeechService", () => {
  const reply = "I opened Notepad and typed your shopping list. I also saved it as list.txt on the desktop.";

  it("streams every chunk in order with audio, marking only the last as final", async () => {
    const { svc } = service();
    const sent = await collect(svc, reply);
    expect(sent.map((m) => m.seq)).toEqual([0, 1]);
    expect(sent.every((m) => m.replyId === "r1")).toBe(true);
    expect(sent.map((m) => m.final)).toEqual([false, true]);
    expect(sent.every((m) => m.data && m.mimeType === "audio/mpeg")).toBe(true);
    expect(sent.map((m) => m.text).join(" ")).toBe(reply);
  });

  it("falls back to text-only chunks (client local voice) when synthesis fails", async () => {
    const { svc } = service({ fail: (t) => t.startsWith("I also") });
    const sent = await collect(svc, reply);
    expect(sent[0].data).toBeDefined();
    expect(sent[1].data).toBeUndefined();
    expect(sent[1].text).toMatch(/^I also/);
  });

  it("stops synthesizing once the monthly character budget is spent", async () => {
    const { svc, synthesize } = service({ cap: 10 });
    const sent = await collect(svc, reply);
    expect(synthesize).not.toHaveBeenCalled();
    expect(sent.every((m) => m.data === undefined)).toBe(true);
  });

  it("serves repeated short phrases from cache", async () => {
    const { svc, synthesize } = service();
    await collect(svc, "Close Chrome? Say yes to confirm.");
    await collect(svc, "Close Chrome? Say yes to confirm.");
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it("sends a single final empty chunk for empty text so the client never waits", async () => {
    const { svc } = service();
    expect(await collect(svc, "")).toEqual([{ type: "assistant_audio", replyId: "r1", seq: 0, final: true, text: "" }]);
  });
});
