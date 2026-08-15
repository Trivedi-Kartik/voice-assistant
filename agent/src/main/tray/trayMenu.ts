import { Tray, Menu, type BrowserWindow, app } from "electron";
import path from "node:path";

// Real bug, caught via actually launching the app: this was one `..` short
// in dev (__dirname is dist/main/tray, three levels below agent/, not two)
// and pointed nowhere at all in a packaged build (build/ was never bundled
// as a runtime resource — see electron-builder.yml's new extraResources).
function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "../../../build/icon.png");
}

export function createTray(win: BrowserWindow, onLogout: () => void): Tray {
  const tray = new Tray(iconPath());
  tray.setToolTip("Karvix");
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
