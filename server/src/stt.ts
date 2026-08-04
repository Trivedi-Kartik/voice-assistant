import Groq, { toFile } from "groq-sdk";

// Whisper isn't a streaming ASR API — the client streams audio chunks as they're
// captured (for low tail latency), but the server buffers/concatenates them per
// utterance and calls Whisper once, on `audio_end`. See docs/ARCHITECTURE.md.
export async function transcribeAudio(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const groq = new Groq({ apiKey });
  const transcription = await groq.audio.transcriptions.create({
    file: await toFile(audioBuffer, "utterance.webm"),
    model: "whisper-large-v3",
  });
  return transcription.text.trim();
}
