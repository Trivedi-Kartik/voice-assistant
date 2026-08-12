import type { AppEntry } from "./appTypes.js";

// Best-effort process/command names — confirmed against the app's own start
// syntax where obvious, but not all of these have been exercised on a real
// Windows machine yet (this dev sandbox is Linux). An app that isn't actually
// installed already fails gracefully (see openApp.ts/closeApp.ts), so a wrong
// or stale entry here degrades to "doesn't seem to be installed/running"
// rather than doing anything unsafe.
const REGISTRY: Record<string, AppEntry> = {
  // Browsers
  chrome: { openCommand: "chrome", processName: "chrome.exe" },
  edge: { openCommand: "msedge", processName: "msedge.exe" },
  firefox: { openCommand: "firefox", processName: "firefox.exe" },
  brave: { openCommand: "brave", processName: "brave.exe" },

  // Editors
  notepad: { openCommand: "notepad", processName: "notepad.exe" },
  vscode: { openCommand: "code", processName: "Code.exe" },
  "notepad++": { openCommand: "notepad++", processName: "notepad++.exe" },
  sublime: { openCommand: "sublime_text", processName: "sublime_text.exe" },

  // Office
  word: { openCommand: "winword", processName: "WINWORD.EXE" },
  excel: { openCommand: "excel", processName: "EXCEL.EXE" },
  powerpoint: { openCommand: "powerpnt", processName: "POWERPNT.EXE" },
  outlook: { openCommand: "outlook", processName: "OUTLOOK.EXE" },

  // Media
  spotify: { openCommand: "spotify:", processName: "Spotify.exe" },
  vlc: { openCommand: "vlc", processName: "vlc.exe" },

  // Communication
  whatsapp: { openCommand: "whatsapp:", processName: "WhatsApp.exe" },
  teams: { openCommand: "msteams:", processName: "ms-teams.exe" },
  slack: { openCommand: "slack:", processName: "slack.exe" },
  discord: { openCommand: "discord:", processName: "Discord.exe" },
  zoom: { openCommand: "zoommtg:", processName: "Zoom.exe" },

  // System / utilities
  calculator: { openCommand: "calc", processName: "CalculatorApp.exe" },
  camera: { openCommand: "microsoft.windows.camera:", processName: "WindowsCamera.exe" },
  paint: { openCommand: "mspaint", processName: "mspaint.exe" },
  "task manager": { openCommand: "taskmgr", processName: "Taskmgr.exe" },
  terminal: { openCommand: "wt", processName: "WindowsTerminal.exe" },
  powershell: { openCommand: "powershell", processName: "powershell.exe" },

  // Open-only: no safe or reliable way to force-close these generically.
  "file explorer": { openCommand: "explorer" },
  settings: { openCommand: "ms-settings:" },
  "control panel": { openCommand: "control" },
};

// A few common alternate names pointing at the same entry, rather than
// duplicating data.
const ALIASES: Record<string, string> = {
  explorer: "file explorer",
  "vs code": "vscode",
  code: "vscode",
};

export function winLookupApp(key: string): AppEntry | undefined {
  return REGISTRY[key] ?? REGISTRY[ALIASES[key] ?? ""];
}

export function winKnownAppNames(): string[] {
  return Object.keys(REGISTRY);
}
