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
import { handleAutomationServerMessage, resetActiveAutomation } from "./automation/automationRunner.js";
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
      // Tell the server this build can play natural-voice audio (older builds never send this).
      connection.send({ type: "client_hello", features: ["assistant_audio"] });
      return;
    case "transcript":
      win.webContents.send("conversation:transcript", msg.text);
      return;
    case "assistant_text":
      conversationActive = false;
      win.webContents.send("conversation:assistantText", msg.text, msg.audioFollows === true, msg.replyId);
      return;
    case "assistant_audio":
      win.webContents.send("conversation:assistantAudio", {
        replyId: msg.replyId,
        seq: msg.seq,
        final: msg.final,
        text: msg.text,
        data: msg.data,
        mimeType: msg.mimeType,
      });
      return;
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
  if (status === "reconnecting" || status === "error" || status === "idle") resetActiveAutomation(win);
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
  if (restored === "restored") {
    await connection.connect();
  }
  win.webContents.send("auth:sessionChanged", { loggedIn: restored === "restored" });

  // Offline / server cold-starting at launch: the stored token is intact (see tryRestoreSession),
  // so keep trying in the background and sign the user in as soon as the server answers, rather
  // than leaving them on the login screen needing their password. Render's cold start is ~1 min.
  if (restored === "unavailable") {
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((r) => setTimeout(r, 10_000));
      if (authManager.isLoggedIn()) return; // user logged in manually meanwhile
      const retry = await authManager.tryRestoreSession();
      if (retry === "unavailable") continue;
      if (retry === "restored") {
        await connection.connect();
        win.webContents.send("auth:sessionChanged", { loggedIn: true });
      }
      return;
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
