import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { homeDir } from "./paths.js";
import type { AgentActionWire } from "../../shared/protocol.js";
import type { AgentActionResult } from "./skills.js";
import { portalKeys, portalType } from "./a11y/portal.js";
import { clickElement, closeWindowByTitle, focusWindowByTitle, keyboardTargetCheck, listWindows, setElementText, takeSnapshot, typeIntoFocused, uiAvailable } from "./ui.js";

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

async function windowsForegroundTitle(): Promise<string> {
  const parsed = JSON.parse(await runPs(WIN_OBSERVE)) as { active?: string };
  return parsed.active ?? "";
}

async function windowsUi(a: AgentActionWire): Promise<AgentActionResult> {
  if ((a.name === "type_text" || a.name === "hotkey") && str(a.args.window)) {
    const fg = await windowsForegroundTitle();
    if (!fg.toLowerCase().includes(str(a.args.window).toLowerCase())) {
      return { ok: false, message: `The keyboard is in "${fg}", not "${str(a.args.window)}" — use focus_window first.` };
    }
  }
  switch (a.name) {
    case "focus_window": {
      if (await uiAvailable()) { const r = await focusWindowByTitle(str(a.args.title)); if (r.ok) return r; }
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
    case "click": {
      const r = await clickElement(str(a.args.element));
      return r.ok && a.args.double === true ? { ok: false, message: "Double-click isn't supported — click once or use a keyboard shortcut." } : r;
    }
    case "set_text":
      return setElementText(str(a.args.element), str(a.args.text));
    case "close_window": {
      const r = await closeWindowByTitle(str(a.args.title));
      return { ok: r.ok, message: r.message, ...(r.elements ? { observation: { elements: r.elements } } : {}) };
    }
    default:
      return { ok: false, message: `"${a.name}" isn't available on Windows.` };
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

// On X11 the focused window is unambiguous (xdotool getactivewindow); still make sure it's the one meant.
async function x11TargetCheck(intended: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!intended) return keyboardTargetCheck(); // falls back to the last observed window
  const { stdout } = await execFileAsync("xdotool", ["getactivewindow", "getwindowname"], { timeout: 3000 });
  const active = stdout.trim();
  return active.toLowerCase().includes(intended.toLowerCase())
    ? { ok: true }
    : { ok: false, message: `The keyboard is in "${active}", not "${intended}" — bring the right window to the front first.` };
}

async function linuxUi(a: AgentActionWire): Promise<AgentActionResult> {
  const wayland = isWayland();
  const a11y = await uiAvailable();
  const xdo = !wayland && (await hasXdotool());

  switch (a.name) {
    // Accessibility-driven (works on Wayland and X11): operate controls by id/name, no pixels.
    case "click": {
      if (!a11y) return { ok: false, message: "Clicking needs the accessibility library (sudo apt install python3-gi gir1.2-atspi-2.0)." };
      const r = await clickElement(str(a.args.element));
      return r.ok && a.args.double === true ? { ok: false, message: "Double-click isn't supported through accessibility — click once or use a keyboard shortcut." } : r;
    }
    case "set_text": {
      if (!a11y) return { ok: false, message: "Typing into fields needs the accessibility library (sudo apt install python3-gi gir1.2-atspi-2.0)." };
      return setElementText(str(a.args.element), str(a.args.text));
    }
    case "type_text": {
      // X11: real key events. Wayland: the RemoteDesktop portal (user approves once), else insert into the focused
      // text field via accessibility. Either way, only after confirming the right window has the keyboard.
      if (xdo || wayland) {
        const chk = xdo ? await x11TargetCheck(str(a.args.window)) : await keyboardTargetCheck(str(a.args.window));
        if (!chk.ok) return chk;
      }
      if (xdo) {
        await execFileAsync("xdotool", ["type", "--delay", "15", "--", str(a.args.text)], { timeout: 30_000 });
        return { ok: true, message: "Typed the text." };
      }
      if (wayland) {
        const r = await portalType(str(a.args.text));
        if (r.ok || !a11y) return r;
      }
      if (a11y) return typeIntoFocused(str(a.args.text));
      return { ok: false, message: "I can't type into other apps on this system yet." };
    }
    case "focus_window": {
      if (xdo) {
        try {
          await execFileAsync("xdotool", ["search", "--name", str(a.args.title), "windowactivate", "--sync"], { timeout: 5000 });
          return { ok: true, message: `Switched to "${str(a.args.title)}".` };
        } catch {
          return { ok: false, message: `No window titled "${str(a.args.title)}" found.` };
        }
      }
      return a11y ? focusWindowByTitle(str(a.args.title)) : { ok: false, message: "I can't switch windows on this system yet." };
    }
    case "close_window": {
      if (!a11y) return { ok: false, message: "Closing windows needs the accessibility library (sudo apt install python3-gi gir1.2-atspi-2.0)." };
      const r = await closeWindowByTitle(str(a.args.title));
      return { ok: r.ok, message: r.message, ...(r.elements ? { observation: { elements: r.elements } } : {}) };
    }
    case "hotkey": {
      const keyList = Array.isArray(a.args.keys) ? a.args.keys.map((k) => String(k)) : [];
      if (xdo || wayland) {
        const chk = xdo ? await x11TargetCheck(str(a.args.window)) : await keyboardTargetCheck(str(a.args.window));
        if (!chk.ok) return chk;
      }
      if (!xdo && wayland) {
        const r = await portalKeys(keyList);
        return r.ok ? r : { ...r, message: `${r.message} Click the matching button or menu item instead.` };
      }
      if (!xdo) return { ok: false, message: "Keyboard shortcuts aren't available on this desktop yet — click the matching button or menu item instead." };
      const keys = Array.isArray(a.args.keys) ? a.args.keys.map((k) => String(k).toLowerCase()) : [];
      const combo = keys.map((k) => XDO_KEYS[k] ?? (k.length === 1 ? k : `F${k.replace(/^f/, "")}`)).join("+");
      await execFileAsync("xdotool", ["key", "--", combo], { timeout: 5000 });
      return { ok: true, message: `Pressed ${keys.join("+")}.` };
    }
    default:
      return { ok: false, message: `"${a.name}" isn't available on Linux yet.` };
  }
}

// UI actions get the fresh state of the window attached to their result (after a short settle delay), so the
// planner sees what its click/typing did without an extra round-trip. Without the delay the read caught the
// Calculator mid-update ("7+" instead of "12") in testing.
const SETTLE_MS = 600;

export async function runUiAction(a: AgentActionWire): Promise<AgentActionResult> {
  const result = await (process.platform === "win32" ? windowsUi(a) : linuxUi(a));
  if (!result.ok) return result;
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const snap = await takeSnapshot("");
  return snap.ok ? { ...result, observation: { elements: snap.text } } : result;
}

// The explicit `observe` action: windows + the active window's elements.
export async function observeUi(windowQuery = ""): Promise<AgentActionResult> {
  const obs = await observe();
  const snap = await takeSnapshot(windowQuery);
  return { ok: true, message: snap.ok ? "Looked at the active window." : snap.message, observation: { ...obs, ...(snap.ok ? { elements: snap.text } : {}) } };
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
    } else if (await uiAvailable()) {
      const wins = await listWindows();
      const active = wins.find((w) => w.active);
      if (active) obs.activeWindow = { title: active.title, app: active.app };
      obs.windows = wins.map((w) => ({ title: w.title, app: w.app }));
      if (isWayland()) notes.push("Wayland: apps are operated through accessibility (click/set_text by element id); keyboard shortcuts and window raising are limited.");
    } else if (!isWayland() && (await hasXdotool())) {
      const { stdout } = await execFileAsync("xdotool", ["getactivewindow", "getwindowname"], { timeout: 3000 });
      obs.activeWindow = { title: stdout.trim() };
    } else {
      notes.push("Reading app windows isn't available (install python3-gi and gir1.2-atspi-2.0).");
    }
  } catch (err) {
    notes.push(`(window information unavailable: ${(err as Error).message.slice(0, 120)})`);
  }
  return obs;
}
