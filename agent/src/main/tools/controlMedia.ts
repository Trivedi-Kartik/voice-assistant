import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

// Fixed virtual-key codes (see winuser.h) — the LLM only ever supplies one of
// the enum values below, resolved through this map, never raw text passed
// through. Simulated via keybd_event (global, hardware-key-equivalent), same
// as a physical multimedia keyboard key — works regardless of which app has
// focus, unlike sending keys to a specific window.
const VK_CODES = {
  play_pause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  stop: 0xb2,
  volume_up: 0xaf,
  volume_down: 0xae,
  mute: 0xad,
} as const;

type Action = keyof typeof VK_CODES;

const argsSchema = z.object({
  action: z.enum(["play_pause", "next", "previous", "stop", "volume_up", "volume_down", "mute"]),
});

// Deliberately PowerShell + user32.dll, not a native Node addon (e.g. robotjs)
// — see docs/ARCHITECTURE.md. A prebuilt native binding already failed to
// load on a real Windows machine for an unrelated feature (onnxruntime-node);
// PowerShell and user32.dll ship with every Windows install, no extra
// dependency to get wrong.
function keybdEventScript(vk: number): string {
  return (
    `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; ` +
    `public class Vk { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, uint e); }'; ` +
    `[Vk]::keybd_event(${vk},0,0,0); Start-Sleep -Milliseconds 50; [Vk]::keybd_event(${vk},0,2,0);`
  );
}

export const controlMediaTool: ToolDefinition<{ action: Action }> = {
  name: "control_media",
  sensitivity: "low",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ action }) {
    try {
      // Fixed argv passed to execFile — the only variable part of the script
      // string is the VK integer, always one of the 7 fixed values above.
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", keybdEventScript(VK_CODES[action])]);
      return { ok: true, message: `Did ${action.replace("_", " ")}.` };
    } catch {
      return { ok: false, message: "Couldn't control media playback." };
    }
  },
};
