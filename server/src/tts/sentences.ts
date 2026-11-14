// Splits a reply into speakable chunks so audio for the first sentence can start playing while the
// rest is still being synthesized. Short fragments are merged (one tiny request per "Ok." would add
// latency, not remove it), and over-long sentences are cut at commas/spaces so no single request
// stalls playback.
const SENTENCE_END = /(?<=[.!?。！？।])\s+/u; // includes the Hindi danda
const MIN_CHUNK = 25;
const MAX_CHUNK = 300;

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    // Prefer a comma, then a space, near the limit; hard-cut only if neither exists (e.g. Thai runs).
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("، "));
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
  // Thai writes no sentence punctuation; chunk on length (spaces separate phrases).
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
