import { findCustomApp, listCustomApps } from "../customApps/customAppStore.js";
import type { AppEntry } from "./appTypes.js";
import { winLookupApp, winKnownAppNames } from "./appRegistry.win.js";
import { linuxLookupApp, linuxKnownAppNames } from "./appRegistry.linux.js";

export type { AppEntry } from "./appTypes.js";

// Platform dispatch — chosen once at module load (the OS doesn't change
// mid-session). openApp.ts/closeApp.ts import from this file only and stay
// fully platform-agnostic; appExec.ts mirrors this same dispatch shape for
// the execution side. See docs/ARCHITECTURE.md "Linux compatibility."
const IS_WINDOWS = process.platform === "win32";

// Custom (user-added, see tools/addCustomApp.ts) entries are checked first, ahead of either
// platform's built-in list — a user's own mapping wins if they've defined
// one, e.g. re-pointing "chrome" at a portable install. This merge is
// platform-agnostic on purpose: it lives here once, not duplicated in both
// appRegistry.win.ts and appRegistry.linux.ts.
export function lookupApp(name: string): AppEntry | undefined {
  const key = name.toLowerCase().trim();
  const custom = findCustomApp(key);
  if (custom) return { openCommand: custom.openCommand, processName: custom.processName, args: custom.args };
  return IS_WINDOWS ? winLookupApp(key) : linuxLookupApp(key);
}

export function knownAppNames(): string[] {
  const base = IS_WINDOWS ? winKnownAppNames() : linuxKnownAppNames();
  return [...base, ...listCustomApps().map((a) => a.name)];
}
