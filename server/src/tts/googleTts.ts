// Google Cloud Text-to-Speech, Chirp 3 HD voices (natural, all 8 supported languages incl. Hindi
// and Thai). Plain REST with an API key — no SDK/service-account file needed on Render.
// Docs: https://cloud.google.com/text-to-speech/docs/chirp3-hd
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

// One locale per supported language (server/src/i18n/languages.ts).
export const TTS_LOCALES: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-BR",
  th: "th-TH",
};

export const TTS_MIME_TYPE = "audio/mpeg";

export class TtsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface SynthesizeOptions {
  apiKey: string;
  voice: string; // Chirp 3 HD voice name suffix, e.g. "Aoede" -> "en-US-Chirp3-HD-Aoede"
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function synthesizeSpeech(text: string, language: string, opts: SynthesizeOptions): Promise<Buffer> {
  const locale = TTS_LOCALES[language] ?? TTS_LOCALES.en;
  const res = await (opts.fetchImpl ?? fetch)(`${ENDPOINT}?key=${encodeURIComponent(opts.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${opts.voice}` },
      // MP3 decodes everywhere (WebAudio decodeAudioData in Electron), and is small enough for chat-length replies.
      audioConfig: { audioEncoding: "MP3" },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  const body = (await res.json().catch(() => ({}))) as { audioContent?: string; error?: { message?: string } };
  if (!res.ok || !body.audioContent) {
    // Never include the request URL in errors/logs — it carries the API key.
    throw new TtsError(res.status, body.error?.message ?? `tts_failed_${res.status}`);
  }
  return Buffer.from(body.audioContent, "base64");
}
