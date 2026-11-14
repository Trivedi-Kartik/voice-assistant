import { describe, it, expect } from "vitest";
import { isTrivialTranscript } from "./stt.js";

// Real bug, found via live testing: Whisper hallucinating "." or a stray
// letter on near-silent audio was passing straight through the old
// `if (!transcript)` check in ws/session.ts and starting a real turn. These
// pin the threshold itself — ws/session.test.ts pins that Session actually
// calls this function.
describe("isTrivialTranscript", () => {
  it.each(["", ".", "I", "  . ", "!?", "...", " "])("rejects %j as trivial", (text) => {
    expect(isTrivialTranscript(text)).toBe(true);
  });

  it.each(["Hi", "Ok", "No", "Yes.", "42", "go"])("accepts %j as real content", (text) => {
    expect(isTrivialTranscript(text)).toBe(false);
  });
});
