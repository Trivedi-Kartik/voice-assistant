import { BrowserWindow } from "electron";
import path from "node:path";

// Secure by construction: contextIsolation + sandbox on, nodeIntegration off. The
// renderer gets ONLY what preload/index.ts explicitly exposes via contextBridge —
// no ipcRenderer, no require, no Node APIs. See docs/ARCHITECTURE.md.
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 360,
    minHeight: 480,
    title: "Voice Agent",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}
