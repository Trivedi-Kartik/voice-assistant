export interface ToolActivity {
  name: string;
  result: { ok: boolean; message: string; data?: unknown };
}

export interface JarvisApi {
  platform: NodeJS.Platform;
  tts: {
    speak(text: string, language: string): Promise<void>;
    stop(): void;
  };
  consent: {
    hasConsented(): Promise<boolean>;
    record(): Promise<void>;
  };
  auth: {
    getSession(): Promise<{ loggedIn: boolean; language: string }>;
    signup(email: string, password: string): Promise<{ loggedIn: boolean }>;
    login(email: string, password: string): Promise<{ loggedIn: boolean }>;
    logout(): Promise<void>;
    setGroqKey(apiKey: string): Promise<void>;
    onSessionChanged(cb: (payload: { loggedIn: boolean }) => void): void;
  };
  settings: {
    setLanguage(language: string): Promise<void>;
  };
  audio: {
    sendChunk(base64: string): void;
    sendEnd(): void;
  };
  connection: {
    retryNow(): void;
    onStatus(cb: (status: string) => void): void;
  };
  conversation: {
    onTranscript(cb: (text: string) => void): void;
    onAssistantText(cb: (text: string) => void): void;
    onError(cb: (payload: { code: string; message: string }) => void): void;
    onToolActivity(cb: (payload: ToolActivity) => void): void;
    setActive(active: boolean): void;
    onAutomationStart(cb: (payload: { goal: string }) => void): void;
    onAutomationStep(cb: (payload: { action: { risk: string; reasoning: string }; ok: boolean; message: string }) => void): void;
    onAutomationStop(cb: () => void): void;
    cancelAutomation(): void;
  };
  hotkey: {
    onPress(cb: () => void): void;
  };
  shell: {
    openMicSettings(): void;
    openPrivacyPolicy(): void;
  };
  customApps: {
    list(): Promise<{ name: string; openCommand: string; processName?: string }[]>;
    remove(name: string): Promise<void>;
  };
}

declare global {
  interface Window {
    jarvis: JarvisApi;
  }
}
