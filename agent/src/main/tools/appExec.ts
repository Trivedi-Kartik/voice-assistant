import type { AppEntry } from "./appTypes.js";
import { winOpenApp, winCloseApp } from "./appExec.win.js";
import { linuxOpenApp, linuxCloseApp } from "./appExec.linux.js";

// Same dispatch shape as appRegistry.ts — openApp.ts/closeApp.ts stay fully
// platform-agnostic, importing only from here.
const IS_WINDOWS = process.platform === "win32";

export function openViaPlatform(entry: AppEntry): Promise<boolean> {
  return IS_WINDOWS ? winOpenApp(entry.openCommand) : linuxOpenApp(entry.openCommand, entry.args);
}

export function closeViaPlatform(processName: string): Promise<boolean> {
  return IS_WINDOWS ? winCloseApp(processName) : linuxCloseApp(processName);
}
