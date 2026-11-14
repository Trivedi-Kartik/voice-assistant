// Splits a reply into speakable chunks (≈ sentences) so playback can start after the first one.
// Mirrors server/src/tts/sentences.ts by hand (agent/ and server/ share no code — see CLAUDE.md).
const SENTENCE_END = /(?<=[.!?。！？।])\s+/u;
const MIN_CHUNK = 25;
const MAX_CHUNK = 300;

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf(", ");
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut + (rest[cut] === "," ? 1 : 0)).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function splitIntoSpeechChunks(text: string, language: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = language === "th" ? [clean] : clean.split(SENTENCE_END);
  const chunks: string[] = [];
  for (const s of sentences.flatMap((x) => splitLong(x.trim(), language === "th" ? 120 : MAX_CHUNK))) {
    if (!s) continue;
    const prev = chunks[chunks.length - 1];
    if (prev !== undefined && (prev.length < MIN_CHUNK || s.length < MIN_CHUNK) && prev.length + s.length + 1 <= MAX_CHUNK) {
      chunks[chunks.length - 1] = `${prev} ${s}`;
    } else {
      chunks.push(s);
    }
  }
  return chunks;
}
