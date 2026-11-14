import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AutomationAction } from "../../../shared/protocol.js";

const execFileAsync = promisify(execFile);

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_WHEEL = 0x0800;

const SENDKEYS_NAMED_KEYS: Record<string, string> = {
  Enter: "{ENTER}",
  Escape: "{ESC}",
  Tab: "{TAB}",
  Backspace: "{BACKSPACE}",
  Delete: "{DEL}",
  Home: "{HOME}",
  End: "{END}",
};

// Deliberately PowerShell + user32.dll/System.Windows.Forms, not a native
// Node addon (e.g. robotjs/nut-js) — same reasoning as controlMedia.ts: a
// prebuilt native binding already failed to load on real Windows hardware for
// an unrelated feature, and everything used here ships with every Windows
// install already.
const MOUSE_EVENT_TYPEDEF =
  "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; " +
  'public class Input { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int data, uint extra); }\'; ';

// Text/keys are NEVER interpolated into the PowerShell script. The previous approach (doubling
// ASCII ' inside a single-quoted string) was incomplete: PowerShell also treats the Unicode
// quotes U+2018 U+2019 U+201A U+201B as string delimiters, so model output like "don’t" (LLMs
// emit curly apostrophes routinely) broke the script, and on-screen content steering the vision
// model to emit  ’; Start-Process calc; ’  became arbitrary command execution. Instead the content
// travels as base64 ([A-Za-z0-9+/=] — nothing in it can end a string) and is decoded inside
// PowerShell, so the script text is fixed regardless of what the model said.
function psDecodedUtf8(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))`;
}

// SendKeys has its own small set of syntactically special characters
// (+^%~(){}[]) that must be wrapped in braces to be typed literally, distinct
// from PowerShell's own quoting above.
function escapeForSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}");
}

// Exported only so the script construction can be verified without a Windows machine.
export function scriptFor(action: AutomationAction): string | null {
  switch (action.type) {
    case "click": {
      if (action.x === undefined || action.y === undefined) return null;
      return (
        "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; " +
        `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(action.x)}, ${Math.round(action.y)}); ` +
        MOUSE_EVENT_TYPEDEF +
        `[Input]::mouse_event(${MOUSEEVENTF_LEFTDOWN},0,0,0,0); Start-Sleep -Milliseconds 50; [Input]::mouse_event(${MOUSEEVENTF_LEFTUP},0,0,0,0);`
      );
    }
    case "type": {
      if (!action.text) return null;
      return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psDecodedUtf8(escapeForSendKeys(action.text))});`;
    }
    case "key": {
      if (!action.key) return null;
      const keys = SENDKEYS_NAMED_KEYS[action.key] ?? escapeForSendKeys(action.key);
      return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psDecodedUtf8(keys)});`;
    }
    case "scroll": {
      const delta = action.y ?? 0;
      return MOUSE_EVENT_TYPEDEF + `[Input]::mouse_event(${MOUSEEVENTF_WHEEL},0,0,${Math.round(-delta * 40)},0);`;
    }
    default:
      return null;
  }
}

// Disclosed limitation, not a silent failure: SendInput-equivalent calls from
// a non-elevated process cannot deliver input to a UAC-elevated window — see
// docs/SETUP.md. There is no in-app fix for this (same category as the
// AppImage sandbox limitation), so it's documented rather than papered over.
export async function performActionWindows(action: AutomationAction): Promise<{ ok: boolean; message: string }> {
  const script = scriptFor(action);
  if (!script) return { ok: false, message: `Couldn't perform "${action.type}" — missing required fields.` };
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    return { ok: true, message: `Did: ${action.reasoning}` };
  } catch (err) {
    console.error("[automation] windows input failed", err);
    return { ok: false, message: "Couldn't perform that action." };
  }
}
