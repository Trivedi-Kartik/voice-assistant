// Must be the very first import: authManager.ts/connection.ts read
// process.env.SERVER_HTTP_URL/SERVER_WS_URL at module-load time, so .env has
// to be loaded (when present) before those modules are required. Dev-only in
// practice: .env is never bundled into a packaged app (see
// electron-builder.yml's `files:`), so a packaged build always falls through
// to authManager.ts/connection.ts's own hardcoded production-URL defaults —
// verified by actually tracing the compiled output, not assumed. See
// docs/SETUP.md "Packaging."
import "dotenv/config";
import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { authManager } from "./auth/authManager.js";
import { Connection, type ConnectionStatus } from "./ws/connection.js";
import { HotkeyTriggerSource } from "./hotkey/hotkeyTriggerSource.js";
import { dispatchToolCall } from "./tools/index.js";
import { handleAutomationServerMessage } from "./automation/automationRunner.js";
import { startReminderScheduler } from "./reminders/reminderScheduler.js";
import { registerIpcHandlers } from "./ipc/ipcHandlers.js";
import { createMainWindow } from "./window.js";
import { createTray } from "./tray/trayMenu.js";
import { initAutoUpdater } from "./updater/autoUpdate.js";
import { applyContentSecurityPolicy } from "./csp.js";
import type { ServerMessage } from "../shared/protocol.js";

let win: BrowserWindow;
let conversationActive = false;

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "auth_ok":
      return;
    case "transcript":
      win.webContents.send("conversation:transcript", msg.text);
      return;
    case "assistant_text":
      conversationActive = false;
      win.webContents.send("conversation:assistantText", msg.text);
      return;
    case "assistant_audio":
      return; // reserved for v2 TTS upgrade — v1 client doesn't advertise support
    case "tool_call": {
      dispatchToolCall(msg.name, msg.args)
        .then((result) => {
          connection.send({ type: "tool_result", callId: msg.callId, result });
          win.webContents.send("conversation:toolActivity", { name: msg.name, result });
        })
        .catch((err) => console.error("[main] dispatchToolCall unexpectedly rejected", err));
      return;
    }
    case "error":
      conversationActive = false;
      win.webContents.send("conversation:error", { code: msg.code, message: msg.message });
      return;
    case "automation_start":
    case "automation_action":
    case "automation_stop":
      void handleAutomationServerMessage(msg, (m) => connection.send(m), win);
      return;
  }
}

function handleConnectionStatus(status: ConnectionStatus): void {
  win.webContents.send("connection:status", status);
}

const connection = new Connection({
  onStatus: handleConnectionStatus,
  onServerMessage: handleServerMessage,
});

async function afterLogin(): Promise<void> {
  win.webContents.send("auth:sessionChanged", { loggedIn: true });
  await connection.connect();
}

function afterLogout(): void {
  win.webContents.send("auth:sessionChanged", { loggedIn: false });
}

app.whenReady().then(async () => {
  applyContentSecurityPolicy(!app.isPackaged);
  win = createMainWindow();
  startReminderScheduler();

  registerIpcHandlers({
    win,
    connection,
    onLoggedIn: afterLogin,
    onLoggedOut: afterLogout,
    onConversationActiveChanged: (active) => {
      conversationActive = active;
    },
  });

  // Hotkey is now a single "toggle" signal — the renderer (which also has a
  // clickable mic button) is the sole source of truth for whether it's currently
  // recording, and decides start-vs-stop itself. See hotkey/triggerSource.ts.
  const hotkey = new HotkeyTriggerSource();
  hotkey.start(() => win.webContents.send("hotkey:pressed"));

  createTray(win, () => {
    connection.disconnect();
    authManager.logout().then(afterLogout);
  });

  initAutoUpdater(
    () => conversationActive,
    () => autoUpdater.quitAndInstall()
  );

  const restored = await authManager.tryRestoreSession();
  if (restored) {
    await connection.connect();
  }
  win.webContents.send("auth:sessionChanged", { loggedIn: restored });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
