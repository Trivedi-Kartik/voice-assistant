import { Tray, Menu, type BrowserWindow, app } from "electron";
import path from "node:path";

export function createTray(win: BrowserWindow, onLogout: () => void): Tray {
  const tray = new Tray(path.join(__dirname, "../../build/icon.png"));
  tray.setToolTip("Voice Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => win.show() },
      { label: "Log out", click: onLogout },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );
  tray.on("click", () => win.show());
  return tray;
}
