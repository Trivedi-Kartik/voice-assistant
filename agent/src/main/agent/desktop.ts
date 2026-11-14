import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { homeDir } from "./paths.js";
import type { AgentActionWire } from "../../shared/protocol.js";
import type { AgentActionResult } from "./skills.js";

const execFileAsync = promisify(execFile);

export interface Observation {
  platform: string;
  activeWindow?: { title: string; app?: string };
  windows?: { title: string; app?: string }[];
  elements?: string;
  notes?: string[];
}

const isWayland = () => process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));
const str = (v: unknown) => (typeof v === "string" ? v : "");

// ---------------- Windows: PowerShell via -EncodedCommand; all variable data travels as base64 ----------------
function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}
function psString(text: string): string {
  return `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(text)}'))`;
}
async function runPs(script: string, timeout = 15_000): Promise<string> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { timeout, windowsHide: true });
  return stdout.trim();
}

const WIN_OBSERVE = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class KvxWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$sb = New-Object System.Text.StringBuilder 512
[void][KvxWin]::GetWindowText([KvxWin]::GetForegroundWindow(), $sb, 512)
$wins = @(Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -First 40 | ForEach-Object { @{ title = $_.MainWindowTitle; app = $_.ProcessName } })
@{ active = $sb.ToString(); windows = $wins } | ConvertTo-Json -Compress -Depth 3
`;

// SendKeys notation for hotkey(["ctrl","s"]) etc.
const SENDKEYS: Record<string, string> = {
  enter: "{ENTER}", return: "{ENTER}", tab: "{TAB}", esc: "{ESC}", escape: "{ESC}", backspace: "{BACKSPACE}",
  delete: "{DEL}", del: "{DEL}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}", home: "{HOME}",
  end: "{END}", pageup: "{PGUP}", pagedown: "{PGDN}", space: " ", insert: "{INS}",
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, `{F${i + 1}}`])),
};
const SENDKEYS_MOD: Record<string, string> = { ctrl: "^", control: "^", alt: "%", shift: "+" };
function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}");
}
export function toSendKeys(keys: string[]): string | null {
  const lower = keys.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (lower.length === 0) return null;
  let mods = "";
  let main = "";
  for (const k of lower) {
    if (SENDKEYS_MOD[k]) mods += SENDKEYS_MOD[k];
    else if (SENDKEYS[k]) main = SENDKEYS[k];
    else if (k.length === 1) main = escapeSendKeys(k);
    else return null; // unknown key name (e.g. "win") — SendKeys can't express it
  }
  return main ? mods + main : null;
}

async function windowsUi(a: AgentActionWire): Promise<AgentActionResult> {
  switch (a.name) {
    case "focus_window": {
      const out = await runPs(`$w = New-Object -ComObject WScript.Shell; if ($w.AppActivate(${psString(str(a.args.title))})) { 'ok' } else { 'missing' }`);
      return out === "ok" ? { ok: true, message: `Switched to "${str(a.args.title)}".` } : { ok: false, message: `No window titled "${str(a.args.title)}" found.` };
    }
    case "type_text": {
      await runPs(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psString(escapeSendKeys(str(a.args.text)))})`);
      return { ok: true, message: "Typed the text." };
    }
    case "hotkey": {
      const keys = Array.isArray(a.args.keys) ? a.args.keys.map(String) : [];
      const sk = toSendKeys(keys);
      if (!sk) return { ok: false, message: `I can't press "${keys.join("+")}" on Windows yet.` };
      await runPs(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psString(sk)})`);
      return { ok: true, message: `Pressed ${keys.join("+")}.` };
    }
    default:
      return { ok: false, message: `"${a.name}" on UI elements isn't available on Windows yet (coming with accessibility support). Use a file/app skill or keyboard shortcuts instead.` };
  }
}

// ---------------- Linux X11: xdotool (Wayland: not yet — plan Phase 4) ----------------
const XDO_KEYS: Record<string, string> = {
  enter: "Return", return: "Return", tab: "Tab", esc: "Escape", escape: "Escape", backspace: "BackSpace", delete: "Delete",
  up: "Up", down: "Down", left: "Left", right: "Right", home: "Home", end: "End", pageup: "Prior", pagedown: "Next",
  space: "space", ctrl: "ctrl", control: "ctrl", alt: "alt", shift: "shift", win: "super", super: "super",
};
async function hasXdotool(): Promise<boolean> {
  try {
    await execFileAsync("xdotool", ["version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function linuxUi(a: AgentActionWire): Promise<AgentActionResult> {
  if (isWayland()) {
    return { ok: false, message: "Controlling windows and the keyboard isn't available on Wayland yet. Use file and app skills instead." };
  }
  if (!(await hasXdotool())) return { ok: false, message: "Window control needs xdotool (sudo apt install xdotool)." };
  switch (a.name) {
    case "focus_window": {
      try {
        await execFileAsync("xdotool", ["search", "--name", str(a.args.title), "windowactivate", "--sync"], { timeout: 5000 });
        return { ok: true, message: `Switched to "${str(a.args.title)}".` };
      } catch {
        return { ok: false, message: `No window titled "${str(a.args.title)}" found.` };
      }
    }
    case "type_text":
      await execFileAsync("xdotool", ["type", "--delay", "15", "--", str(a.args.text)], { timeout: 30_000 });
      return { ok: true, message: "Typed the text." };
    case "hotkey": {
      const keys = Array.isArray(a.args.keys) ? a.args.keys.map((k) => String(k).toLowerCase()) : [];
      const combo = keys.map((k) => XDO_KEYS[k] ?? (k.length === 1 ? k : `F${k.replace(/^f/, "")}`)).join("+");
      await execFileAsync("xdotool", ["key", "--", combo], { timeout: 5000 });
      return { ok: true, message: `Pressed ${keys.join("+")}.` };
    }
    default:
      return { ok: false, message: `"${a.name}" on UI elements isn't available on Linux yet. Use a file/app skill or keyboard shortcuts instead.` };
  }
}

export function runUiAction(a: AgentActionWire): Promise<AgentActionResult> {
  return process.platform === "win32" ? windowsUi(a) : linuxUi(a);
}

// ---------------- Observation ----------------
export async function observe(): Promise<Observation> {
  const home = homeDir();
  const folders = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"].filter((f) => fs.existsSync(path.join(home, f)));
  const notes = [`Home folder: ~ (${home}). Folders: ${folders.map((f) => `~/${f}`).join(", ")}.`];
  const obs: Observation = { platform: process.platform, notes };
  try {
    if (process.platform === "win32") {
      const parsed = JSON.parse(await runPs(WIN_OBSERVE)) as { active?: string; windows?: { title: string; app?: string }[] };
      if (parsed.active) obs.activeWindow = { title: parsed.active };
      obs.windows = Array.isArray(parsed.windows) ? parsed.windows : parsed.windows ? [parsed.windows as never] : [];
    } else if (isWayland()) {
      notes.push("Linux Wayland session: open windows can't be listed or controlled yet — prefer file and app skills.");
    } else if (await hasXdotool()) {
      const { stdout } = await execFileAsync("xdotool", ["getactivewindow", "getwindowname"], { timeout: 3000 });
      obs.activeWindow = { title: stdout.trim() };
    }
  } catch (err) {
    notes.push(`(window information unavailable: ${(err as Error).message.slice(0, 120)})`);
  }
  return obs;
}
