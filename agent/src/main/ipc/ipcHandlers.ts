import { ipcMain, shell, type BrowserWindow } from "electron";
import { authManager } from "../auth/authManager.js";
import type { Connection } from "../ws/connection.js";
import { hasConsented, recordConsent } from "../consent.js";
import { listCustomApps, removeCustomApp } from "../customApps/customAppStore.js";
import { speakNative, stopNative } from "../tts/nativeTts.js";

export interface IpcContext {
  win: BrowserWindow;
  connection: Connection;
  onLoggedIn: () => Promise<void>;
  onLoggedOut: () => void;
  onConversationActiveChanged: (active: boolean) => void;
}

// Every ipcMain.handle/on registration lives in this one file — easy to audit the
// full renderer-facing surface area in one place, matching preload/index.ts's
// allowlist one-to-one.
export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle("consent:hasConsented", () => hasConsented());
  ipcMain.handle("consent:record", () => recordConsent());

  ipcMain.handle("auth:getSession", () => ({
    loggedIn: authManager.isLoggedIn(),
    language: authManager.getLanguage(),
  }));

  ipcMain.handle("auth:signup", async (_e, { email, password }: { email: string; password: string }) => {
    await authManager.signup(email, password);
    await ctx.onLoggedIn();
    return { loggedIn: true };
  });

  ipcMain.handle("auth:login", async (_e, { email, password }: { email: string; password: string }) => {
    await authManager.login(email, password);
    await ctx.onLoggedIn();
    return { loggedIn: true };
  });

  ipcMain.handle("auth:logout", async () => {
    ctx.connection.disconnect();
    await authManager.logout();
    ctx.onLoggedOut();
  });

  ipcMain.handle("auth:setGroqKey", async (_e, apiKey: string) => {
    await authManager.setGroqKey(apiKey);
  });

  ipcMain.handle("settings:setLanguage", async (_e, language: string) => {
    await authManager.setLanguage(language);
  });

  ipcMain.on("audio:chunk", (_e, base64: string) => {
    ctx.connection.send({ type: "audio_chunk", data: base64 });
  });

  ipcMain.on("audio:end", () => {
    ctx.connection.send({ type: "audio_end" });
  });

  ipcMain.on("connection:retryNow", () => {
    ctx.connection.retryNow();
  });

  // Renderer is the source of truth for whether it's currently recording/
  // processing a turn (via hotkey or the mic button) — main just needs to know
  // so it doesn't auto-install an update mid-conversation. See updater/autoUpdate.ts.
  ipcMain.on("conversation:setActive", (_e, active: boolean) => {
    ctx.onConversationActiveChanged(active);
  });

  ipcMain.on("shell:openMicSettings", () => {
    shell.openExternal("ms-settings:privacy-microphone");
  });

  // Viewing/removing custom apps (added via the add_custom_app tool, see
  // tools/addCustomApp.ts) is a plain Settings action, not voice-driven —
  // lower stakes than adding one, no need for a confirmation round-trip.
  ipcMain.handle("customApps:list", () => listCustomApps());
  ipcMain.handle("customApps:remove", (_e, name: string) => removeCustomApp(name));

  // Linux-only native TTS fallback — see tts/nativeTts.ts for why. No-op to
  // register on other platforms; renderer only calls these when
  // window.jarvis.platform === "linux".
  ipcMain.handle("tts:speak", (_e, text: string, language: string) => speakNative(text, language));
  ipcMain.on("tts:stop", () => {
    void stopNative();
  });
}
