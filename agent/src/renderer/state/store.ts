import { create } from "zustand";

export type UiStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
export type MicState = "idle" | "listening" | "thinking" | "speaking";

interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

interface AppState {
  loggedIn: boolean | null; // null = not yet known (initial load)
  // Not itself persisted here — the server (User.language) is the source of
  // truth, same as the Groq key. Hydrated from auth:getSession on mount
  // (App.tsx) and updated locally after a successful settings:setLanguage
  // call, mirroring how loggedIn is hydrated/updated.
  language: string;
  connectionStatus: UiStatus;
  micState: MicState;
  turns: ConversationTurn[];
  lastError: { code: string; message: string } | null;
  setLoggedIn: (loggedIn: boolean) => void;
  setLanguage: (language: string) => void;
  setConnectionStatus: (status: string) => void;
  setMicState: (state: MicState) => void;
  pushTurn: (turn: ConversationTurn) => void;
  setError: (error: { code: string; message: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  loggedIn: null,
  language: "en",
  connectionStatus: "idle",
  micState: "idle",
  turns: [],
  lastError: null,
  setLoggedIn: (loggedIn) => set({ loggedIn }),
  setLanguage: (language) => set({ language }),
  setConnectionStatus: (status) => set({ connectionStatus: status as UiStatus }),
  setMicState: (state) => set({ micState: state }),
  pushTurn: (turn) => set((s) => ({ turns: [...s.turns, turn] })),
  setError: (error) => set({ lastError: error }),
}));
