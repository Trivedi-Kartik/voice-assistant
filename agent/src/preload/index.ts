import { contextBridge, ipcRenderer } from "electron";

// The ONLY bridge into the renderer. No ipcRenderer, no require, no Node APIs are
// ever exposed directly — just this narrow, explicit set of calls. See
// docs/ARCHITECTURE.md "Project structure".
contextBridge.exposeInMainWorld("jarvis", {
  // Plain string, not an IPC call — renderer needs this synchronously to
  // decide which TTS engine to construct. See renderer/audio/ttsPlayback.ts.
  platform: process.platform,
  tts: {
    speak: (text: string, language: string) => ipcRenderer.invoke("tts:speak", text, language),
    stop: () => ipcRenderer.send("tts:stop"),
  },
  consent: {
    hasConsented: () => ipcRenderer.invoke("consent:hasConsented"),
    record: () => ipcRenderer.invoke("consent:record"),
  },
  auth: {
    getSession: () => ipcRenderer.invoke("auth:getSession"),
    signup: (email: string, password: string) => ipcRenderer.invoke("auth:signup", { email, password }),
    login: (email: string, password: string) => ipcRenderer.invoke("auth:login", { email, password }),
    logout: () => ipcRenderer.invoke("auth:logout"),
    setGroqKey: (apiKey: string) => ipcRenderer.invoke("auth:setGroqKey", apiKey),
    onSessionChanged: (cb: (payload: { loggedIn: boolean }) => void) => {
      ipcRenderer.on("auth:sessionChanged", (_e, payload) => cb(payload));
    },
  },
  settings: {
    setLanguage: (language: string) => ipcRenderer.invoke("settings:setLanguage", language),
  },
  audio: {
    sendChunk: (base64: string) => ipcRenderer.send("audio:chunk", base64),
    sendEnd: () => ipcRenderer.send("audio:end"),
  },
  connection: {
    retryNow: () => ipcRenderer.send("connection:retryNow"),
    onStatus: (cb: (status: string) => void) => {
      ipcRenderer.on("connection:status", (_e, status) => cb(status));
    },
  },
  conversation: {
    onTranscript: (cb: (text: string) => void) => {
      ipcRenderer.on("conversation:transcript", (_e, text) => cb(text));
    },
    onAssistantText: (cb: (text: string) => void) => {
      ipcRenderer.on("conversation:assistantText", (_e, text) => cb(text));
    },
    onError: (cb: (payload: { code: string; message: string }) => void) => {
      ipcRenderer.on("conversation:error", (_e, payload) => cb(payload));
    },
    onToolActivity: (cb: (payload: { name: string; result: { ok: boolean; message: string } }) => void) => {
      ipcRenderer.on("conversation:toolActivity", (_e, payload) => cb(payload));
    },
    setActive: (active: boolean) => ipcRenderer.send("conversation:setActive", active),
  },
  hotkey: {
    onPress: (cb: () => void) => {
      ipcRenderer.on("hotkey:pressed", () => cb());
    },
  },
  shell: {
    openMicSettings: () => ipcRenderer.send("shell:openMicSettings"),
  },
  customApps: {
    list: () => ipcRenderer.invoke("customApps:list"),
    remove: (name: string) => ipcRenderer.invoke("customApps:remove", name),
  },
});
