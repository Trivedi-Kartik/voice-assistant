import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentActionResult } from "./skills.js";

const execFileAsync = promisify(execFile);
const run = async (cmd: string, args: string[]) => (await execFileAsync(cmd, args, { timeout: 8000, windowsHide: true })).stdout.trim();

// Deterministic system settings (plan §2.6). Linux = GNOME/PipeWire/NetworkManager (tested on Ubuntu 24.04
// Wayland). Windows = best-effort, NOT yet tested on a real Windows machine. Every handler validates its own input;
// the commands are fixed argv (never a shell string).
export type Setting = "volume" | "brightness" | "dark_mode" | "do_not_disturb" | "wifi" | "bluetooth" | "lock_screen";

const pct = (v: string): number | null => {
  const n = Number(String(v).replace("%", ""));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};
const onOff = (v: string): boolean | null => (/^(on|true|enable|enabled|yes|1)$/i.test(v) ? true : /^(off|false|disable|disabled|no|0)$/i.test(v) ? false : null);

// ---------------- Linux ----------------
const SINK = "@DEFAULT_AUDIO_SINK@";
async function linuxVolume(): Promise<{ level: number; muted: boolean }> {
  const out = await run("wpctl", ["get-volume", SINK]); // "Volume: 0.85 [MUTED]"
  const m = out.match(/Volume:\s*([\d.]+)/);
  return { level: m ? Math.round(Number(m[1]) * 100) : 0, muted: /MUTED/.test(out) };
}
const POWER = ["call", "--session", "--dest", "org.gnome.SettingsDaemon.Power", "--object-path", "/org/gnome/SettingsDaemon/Power", "--method"];
async function linuxBrightness(): Promise<number> {
  const out = await run("gdbus", [...POWER, "org.freedesktop.DBus.Properties.Get", "org.gnome.SettingsDaemon.Power.Screen", "Brightness"]);
  return Number(out.match(/(\d+)/)?.[1] ?? NaN);
}

async function linux(setting: Setting, value: string): Promise<AgentActionResult> {
  const v = value.trim().toLowerCase();
  switch (setting) {
    case "volume": {
      if (v === "get" || v === "") { const s = await linuxVolume(); return { ok: true, message: `Volume is ${s.level}%${s.muted ? " (muted)" : ""}.` }; }
      if (v === "mute" || v === "unmute") { await run("wpctl", ["set-mute", SINK, v === "mute" ? "1" : "0"]); return { ok: true, message: v === "mute" ? "Muted." : "Unmuted." }; }
      if (v === "up" || v === "down") { await run("wpctl", ["set-volume", "-l", "1.0", SINK, v === "up" ? "10%+" : "10%-"]); const s = await linuxVolume(); return { ok: true, message: `Volume is now ${s.level}%.` }; }
      const p = pct(v);
      if (p === null) return { ok: false, message: `"${value}" isn't a volume level (use 0-100, up, down, mute, unmute).` };
      await run("wpctl", ["set-volume", "-l", "1.0", SINK, (p / 100).toFixed(2)]);
      return { ok: true, message: `Volume set to ${(await linuxVolume()).level}%.` };
    }
    case "brightness": {
      if (v === "get" || v === "") return { ok: true, message: `Brightness is ${await linuxBrightness()}%.` };
      const cur = await linuxBrightness();
      const p = v === "up" ? Math.min(100, cur + 10) : v === "down" ? Math.max(5, cur - 10) : pct(v);
      if (p === null) return { ok: false, message: `"${value}" isn't a brightness level (use 5-100, up, down).` };
      // Never go fully dark — the user couldn't see the screen to fix it.
      const safe = Math.max(5, p);
      await run("gdbus", [...POWER, "org.freedesktop.DBus.Properties.Set", "org.gnome.SettingsDaemon.Power.Screen", "Brightness", `<int32 ${safe}>`]);
      return { ok: true, message: `Brightness set to ${await linuxBrightness()}%.` };
    }
    case "dark_mode": {
      if (v === "get" || v === "") return { ok: true, message: `Dark mode is ${(await run("gsettings", ["get", "org.gnome.desktop.interface", "color-scheme"])).includes("dark") ? "on" : "off"}.` };
      const on = onOff(v);
      if (on === null) return { ok: false, message: "Say on or off for dark mode." };
      await run("gsettings", ["set", "org.gnome.desktop.interface", "color-scheme", on ? "prefer-dark" : "default"]);
      return { ok: true, message: `Dark mode ${on ? "on" : "off"}.` };
    }
    case "do_not_disturb": {
      if (v === "get" || v === "") return { ok: true, message: `Do not disturb is ${(await run("gsettings", ["get", "org.gnome.desktop.notifications", "show-banners"])) === "false" ? "on" : "off"}.` };
      const on = onOff(v);
      if (on === null) return { ok: false, message: "Say on or off for do not disturb." };
      await run("gsettings", ["set", "org.gnome.desktop.notifications", "show-banners", on ? "false" : "true"]);
      return { ok: true, message: `Do not disturb ${on ? "on" : "off"}.` };
    }
    case "wifi": {
      if (v === "get" || v === "") return { ok: true, message: `Wi-Fi is ${(await run("nmcli", ["radio", "wifi"])) === "enabled" ? "on" : "off"}.` };
      const on = onOff(v);
      if (on === null) return { ok: false, message: "Say on or off for Wi-Fi." };
      await run("nmcli", ["radio", "wifi", on ? "on" : "off"]);
      return { ok: true, message: `Wi-Fi ${on ? "on" : "off"}.` };
    }
    case "bluetooth": {
      if (v === "get" || v === "") return { ok: true, message: `Bluetooth is ${/Soft blocked: yes/.test(await run("rfkill", ["list", "bluetooth"])) ? "off" : "on"}.` };
      const on = onOff(v);
      if (on === null) return { ok: false, message: "Say on or off for Bluetooth." };
      await run("rfkill", [on ? "unblock" : "block", "bluetooth"]);
      return { ok: true, message: `Bluetooth ${on ? "on" : "off"}.` };
    }
    case "lock_screen":
      await run("loginctl", ["lock-session"]);
      return { ok: true, message: "Screen locked." };
  }
}

// ---------------- Windows (best-effort, untested on real Windows) ----------------
function psEncoded(script: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
}
const VK = { up: 0xaf, down: 0xae, mute: 0xad };
function pressVk(vk: number, times = 1): string {
  return `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class KvxK { [DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, int e); }'; for ($i=0; $i -lt ${times}; $i++) { [KvxK]::keybd_event(${vk},0,0,0); [KvxK]::keybd_event(${vk},0,2,0) }`;
}
const PERSONALIZE = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

async function windows(setting: Setting, value: string): Promise<AgentActionResult> {
  const v = value.trim().toLowerCase();
  switch (setting) {
    case "volume": {
      if (v === "up" || v === "down") { await run("powershell.exe", psEncoded(pressVk(VK[v], 5))); return { ok: true, message: `Turned the volume ${v}.` }; }
      if (v === "mute" || v === "unmute") { await run("powershell.exe", psEncoded(pressVk(VK.mute))); return { ok: true, message: "Toggled mute." }; }
      const p = pct(v);
      if (p === null) return { ok: false, message: "On Windows I can turn the volume up, down, or mute it." };
      // No exact-level API without extra components: go to 0, then up in 2% steps (each key = 2%).
      await run("powershell.exe", psEncoded(pressVk(VK.down, 50) + "; " + pressVk(VK.up, Math.round(p / 2))));
      return { ok: true, message: `Volume set to about ${p}%.` };
    }
    case "brightness": {
      const p = pct(v);
      if (p === null) return { ok: false, message: "Give a brightness level from 5 to 100." };
      await run("powershell.exe", psEncoded(`(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${Math.max(5, p)})`));
      return { ok: true, message: `Brightness set to ${Math.max(5, p)}%.` };
    }
    case "dark_mode": {
      const on = onOff(v);
      if (on === null) return { ok: false, message: "Say on or off for dark mode." };
      for (const name of ["AppsUseLightTheme", "SystemUsesLightTheme"]) await run("reg.exe", ["add", PERSONALIZE, "/v", name, "/t", "REG_DWORD", "/d", on ? "0" : "1", "/f"]);
      return { ok: true, message: `Dark mode ${on ? "on" : "off"}.` };
    }
    case "lock_screen":
      await run("rundll32.exe", ["user32.dll,LockWorkStation"]);
      return { ok: true, message: "Screen locked." };
    default:
      return { ok: false, message: `Changing ${setting.replace(/_/g, " ")} isn't available on Windows yet.` };
  }
}

export async function changeSetting(setting: string, value: string): Promise<AgentActionResult> {
  const known: Setting[] = ["volume", "brightness", "dark_mode", "do_not_disturb", "wifi", "bluetooth", "lock_screen"];
  if (!known.includes(setting as Setting)) return { ok: false, message: `I can't change "${setting}".` };
  try {
    return process.platform === "win32" ? await windows(setting as Setting, value) : await linux(setting as Setting, value);
  } catch (err) {
    return { ok: false, message: `Couldn't change ${setting.replace(/_/g, " ")}: ${String((err as Error).message).slice(0, 120)}` };
  }
}
