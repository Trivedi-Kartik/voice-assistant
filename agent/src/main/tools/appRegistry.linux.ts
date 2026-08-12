import type { AppEntry } from "./appTypes.js";

// Best-effort, explicitly UNVERIFIED on a real desktop — this dev sandbox
// has no desktop environment to test against, and desktop Linux distros
// vary far more than Windows in which binaries/apps are actually present
// and what a running app's process name (`comm`) looks like. Same "wrong
// entry degrades to a graceful failure, not anything unsafe" property as
// appRegistry.win.ts: `openViaPlatform`/`closeViaPlatform` (appExec.linux.ts)
// already fail gracefully if a binary/process doesn't exist. Deliberately
// smaller than the Windows list — apps with no clean, honest Linux
// equivalent (Word/Excel/PowerPoint, WhatsApp, classic Teams, mspaint) are
// left out rather than mapped to a wrong analogue (e.g. LibreOffice isn't
// Word) or a distro-specific guess dressed up as universal.
const REGISTRY: Record<string, AppEntry> = {
  // Browsers
  chrome: { openCommand: "google-chrome", processName: "chrome" },
  firefox: { openCommand: "firefox", processName: "firefox" },
  brave: { openCommand: "brave-browser", processName: "brave" },

  // Editors
  vscode: { openCommand: "code", processName: "code" },

  // Media
  spotify: { openCommand: "spotify", processName: "spotify" },
  vlc: { openCommand: "vlc", processName: "vlc" },

  // Communication (official Linux clients only)
  slack: { openCommand: "slack", processName: "slack" },
  discord: { openCommand: "discord", processName: "discord" },
  zoom: { openCommand: "zoom", processName: "zoom" },

  // System / utilities — GNOME-biased where a desktop-specific binary was
  // the only reasonable option; genuinely different on KDE/XFCE/etc.
  calculator: { openCommand: "gnome-calculator", processName: "gnome-calculator" },

  // Open-only: either the actual process launched is unpredictable (a
  // distro-managed default, resolved at launch time — same reasoning class
  // as Windows' File Explorer, just a different root cause), or the target
  // desktop environment/binary varies too much to guess a process name
  // safely.
  "file explorer": { openCommand: "xdg-open", args: ["."] }, // delegates to whatever file manager is actually configured
  terminal: { openCommand: "x-terminal-emulator" }, // Debian/Ubuntu's own "whatever terminal is default" symlink
  settings: { openCommand: "gnome-control-center" },
};

const ALIASES: Record<string, string> = {
  explorer: "file explorer",
  "file manager": "file explorer",
  "vs code": "vscode",
  code: "vscode",
  "control panel": "settings",
};

export function linuxLookupApp(key: string): AppEntry | undefined {
  return REGISTRY[key] ?? REGISTRY[ALIASES[key] ?? ""];
}

export function linuxKnownAppNames(): string[] {
  return Object.keys(REGISTRY);
}
