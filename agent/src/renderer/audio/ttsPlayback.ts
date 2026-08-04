// v1 ships browser SpeechSynthesis (free, zero setup). Swapping to Piper/ElevenLabs
// later (see docs/ROADMAP.md) means adding an AudioTtsEngine behind this same
// interface and switching createTtsEngine()'s return — no UI or protocol changes.
export interface TtsEngine {
  speak(text: string): Promise<void>;
  stop(): void;
}

export class BrowserSpeechSynthesisEngine implements TtsEngine {
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    window.speechSynthesis.cancel();
  }
}

export function createTtsEngine(): TtsEngine {
  return new BrowserSpeechSynthesisEngine();
}
