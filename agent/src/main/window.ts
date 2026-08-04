import { app, BrowserWindow } from "electron";
import path from "node:path";

// Secure by construction: contextIsolation + sandbox on, nodeIntegration off. The
// renderer gets ONLY what preload/index.ts explicitly exposes via contextBridge —
// no ipcRenderer, no require, no Node APIs. See docs/ARCHITECTURE.md.
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 380,
    minHeight: 560,
    title: "Karvix",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // app.isPackaged is Electron's own dev/prod signal — more robust across
  // platforms (esp. Windows) than relying on an env var surviving through a
  // launcher script. Port must match vite.config.ts's server.port.
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}
