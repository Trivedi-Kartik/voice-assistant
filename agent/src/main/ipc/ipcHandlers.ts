import { ipcMain, shell, type BrowserWindow } from "electron";
import { authManager } from "../auth/authManager.js";
import type { Connection } from "../ws/connection.js";
import { hasConsented, recordConsent } from "../consent.js";

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

  ipcMain.handle("auth:getSession", () => ({ loggedIn: authManager.isLoggedIn() }));

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
}
