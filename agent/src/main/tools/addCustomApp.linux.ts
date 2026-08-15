import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { ToolResult } from "./types.js";
import { addCustomApp } from "../customApps/customAppStore.js";

// Same purpose as addCustomApp.win.ts's DENYLIST: block binaries that could
// modify the system or run arbitrary further commands, even though the
// primary safety property here is structural too (a name matched against the
// user's own already-installed apps' menu entries, or a file they physically
// browsed to and selected — never free text fed into a command).
const DENYLIST = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "sudo",
  "su",
  "systemctl",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "dpkg",
  "apt",
  "apt-get",
  "snap",
  "flatpak",
  "useradd",
  "userdel",
  "passwd",
  "chmod",
  "chown",
  "dd",
  "mkfs",
  "iptables",
  "mount",
  "umount",
  "rm",
  "kill",
  "pkill",
  "crontab",
]);

// Every real GUI app installed via apt/snap/flatpak/etc. registers one of
// these — the freedesktop.org "Desktop Entry" spec, the same registry the
// user's own app launcher/search reads from. This is the Linux equivalent of
// Windows' Get-StartApps: enumerate what's actually installed rather than
// asking the user to locate a file, since Linux apps are rarely a single
// known .exe-equivalent path.
const DESKTOP_DIRS = [
  "/usr/share/applications",
  "/usr/local/share/applications",
  "/var/lib/snapd/desktop/applications",
  "/var/lib/flatpak/exports/share/applications",
  path.join(os.homedir(), ".local/share/applications"),
  path.join(os.homedir(), ".local/share/flatpak/exports/share/applications"),
];

interface DesktopApp {
  name: string;
  exec: string;
}

// Field codes (%f, %U, etc.) are placeholders for files/URLs a real launcher
// fills in when opening something FROM that app (e.g. double-clicking a
// document) — meaningless for "just start this app," so they're dropped
// entirely rather than passed through as literal argv tokens.
const FIELD_CODE_TOKEN = /^%[fFuUdDnNickvm]$/;

function parseExec(execLine: string): { command: string; args: string[] } | undefined {
  const tokens = Array.from(execLine.matchAll(/"([^"]*)"|(\S+)/g), (m) => m[1] ?? m[2]).filter(
    (t) => !FIELD_CODE_TOKEN.test(t)
  );
  if (tokens.length === 0) return undefined;
  return { command: tokens[0], args: tokens.slice(1) };
}

// Minimal INI-style parse of just the [Desktop Entry] section — that's the
// only section that matters here, so no need for a full multi-section parser.
function parseDesktopFile(contents: string): DesktopApp | undefined {
  const lines = contents.split("\n");
  let inEntrySection = false;
  let name: string | undefined;
  let exec: string | undefined;
  let noDisplay = false;
  let hidden = false;
  let isApplication = true;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inEntrySection = line === "[Desktop Entry]";
      if (!inEntrySection && name !== undefined) break; // entry section is done
      continue;
    }
    if (!inEntrySection) continue;

    if (line.startsWith("Name=") && name === undefined) name = line.slice("Name=".length);
    else if (line.startsWith("Exec=")) exec = line.slice("Exec=".length);
    else if (line.startsWith("NoDisplay=")) noDisplay = line.slice("NoDisplay=".length).toLowerCase() === "true";
    else if (line.startsWith("Hidden=")) hidden = line.slice("Hidden=".length).toLowerCase() === "true";
    else if (line.startsWith("Type=")) isApplication = line.slice("Type=".length) === "Application";
  }

  if (!name || !exec || noDisplay || hidden || !isApplication) return undefined;
  return { name, exec };
}

async function listDesktopApps(): Promise<DesktopApp[]> {
  const results: DesktopApp[] = [];
  for (const dir of DESKTOP_DIRS) {
    const entries = await fs.readdir(dir).catch(() => [] as string[]); // dir may not exist — fine, skip it
    for (const entry of entries) {
      if (!entry.endsWith(".desktop")) continue;
      const contents = await fs.readFile(path.join(dir, entry), "utf8").catch(() => undefined);
      if (!contents) continue;
      const parsed = parseDesktopFile(contents);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

function findBestMatch(apps: DesktopApp[], name: string): DesktopApp | undefined {
  const needle = name.toLowerCase().trim();
  const exact = apps.find((a) => a.name.toLowerCase() === needle);
  if (exact) return exact;
  // Only auto-pick a substring match if it's unambiguous — mirrors
  // addCustomApp.win.ts's same rule for the same reason.
  const partial = apps.filter((a) => a.name.toLowerCase().includes(needle));
  return partial.length === 1 ? partial[0] : undefined;
}

// Fallback for the rare app with no .desktop entry at all (some CLI-first
// tools/AppImages) — same structural safety as Windows' file-picker fallback:
// the user must select a real, already-existing file, never type a path.
async function pickBinary(name: string): Promise<string | undefined> {
  const parent = BrowserWindow.getFocusedWindow();
  const options = {
    title: `Choose the program for "${name}"`,
    defaultPath: "/usr/bin",
    properties: ["openFile" as const],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

export async function addCustomAppLinux(name: string): Promise<ToolResult> {
  const match = await listDesktopApps()
    .then((apps) => findBestMatch(apps, name))
    .catch(() => undefined);

  let command: string;
  let args: string[];

  if (match) {
    const parsedExec = parseExec(match.exec);
    if (!parsedExec) {
      return { ok: false, message: `"${name}" couldn't be added — its launch command looks malformed.` };
    }
    command = parsedExec.command;
    args = parsedExec.args;
  } else {
    const picked = await pickBinary(name);
    if (!picked) {
      return { ok: false, message: `No app was selected — "${name}" wasn't added.` };
    }
    command = picked;
    args = [];
  }

  const processName = path.basename(command);
  if (DENYLIST.has(processName.toLowerCase())) {
    return { ok: false, message: `"${processName}" can't be added — that's a system program, not a regular app.` };
  }

  addCustomApp(name, command, processName, args);
  return { ok: true, message: `Added ${name} — you can now say "open ${name}" or "close ${name}".` };
}
