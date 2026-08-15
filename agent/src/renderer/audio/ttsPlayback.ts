// v1 ships browser SpeechSynthesis (free, zero setup). Swapping to Piper/ElevenLabs
// later (see docs/ROADMAP.md) means adding an AudioTtsEngine behind this same
// interface and switching createTtsEngine()'s return — no UI or protocol changes.
export interface TtsEngine {
  speak(text: string, language: string): Promise<void>;
  stop(): void;
}

// BCP-47 locale tags for window.speechSynthesis — one representative locale
// per supported language (see renderer/i18n/languages.ts). If the OS has no
// matching voice installed, Chromium falls back to its default voice rather
// than erroring — acceptable degradation, not a crash.
const BCP47_LOCALE: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-BR",
  th: "th-TH",
};

export class BrowserSpeechSynthesisEngine implements TtsEngine {
  speak(text: string, language: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = BCP47_LOCALE[language] ?? BCP47_LOCALE.en;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    window.speechSynthesis.cancel();
  }
}

// Linux fallback: Electron/Chromium ships no real TTS backend on Linux —
// window.speechSynthesis.speak() is a silent no-op there even though the OS's
// own speech-dispatcher/espeak-ng stack works fine. Confirmed live: text
// appeared in chat, no audio played. Shells out to spd-say via the main
// process instead. See main/tts/nativeTts.ts.
export class NativeSpeechDispatcherEngine implements TtsEngine {
  speak(text: string, language: string): Promise<void> {
    return window.jarvis.tts.speak(text, language);
  }

  stop(): void {
    window.jarvis.tts.stop();
  }
}

export function createTtsEngine(): TtsEngine {
  return window.jarvis.platform === "linux" ? new NativeSpeechDispatcherEngine() : new BrowserSpeechSynthesisEngine();
}
