export interface ToolActivity {
  name: string;
  result: { ok: boolean; message: string; data?: unknown };
}

export interface JarvisApi {
  consent: {
    hasConsented(): Promise<boolean>;
    record(): Promise<void>;
  };
  auth: {
    getSession(): Promise<{ loggedIn: boolean }>;
    signup(email: string, password: string): Promise<{ loggedIn: boolean }>;
    login(email: string, password: string): Promise<{ loggedIn: boolean }>;
    logout(): Promise<void>;
    setGroqKey(apiKey: string): Promise<void>;
    onSessionChanged(cb: (payload: { loggedIn: boolean }) => void): void;
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
  };
  hotkey: {
    onPress(cb: () => void): void;
  };
  shell: {
    openMicSettings(): void;
  };
  customApps: {
    list(): Promise<{ name: string; exePath: string; processName: string }[]>;
    remove(name: string): Promise<void>;
  };
}

declare global {
  interface Window {
    jarvis: JarvisApi;
  }
}
