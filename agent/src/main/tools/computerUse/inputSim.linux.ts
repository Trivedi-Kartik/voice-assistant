import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AutomationAction } from "../../../shared/protocol.js";

const execFileAsync = promisify(execFile);

const XDOTOOL_KEY_MAP: Record<string, string> = {
  Enter: "Return",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "BackSpace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
};

function isWayland(): boolean {
  return process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);
}

// xdotool only works under X11 — a privileged ydotool daemon could cover
// Wayland, but that's a materially bigger ask (a root-level background
// daemon) than this feature otherwise needs, so it's deferred rather than
// silently attempted here. Same "disclose a real platform gap rather than
// paper over it" precedent as the AppImage sandbox limitation in
// docs/SETUP.md.
export async function performActionLinux(action: AutomationAction): Promise<{ ok: boolean; message: string }> {
  if (isWayland()) {
    return { ok: false, message: "Screen automation isn't supported on Wayland yet — only X11." };
  }
  try {
    switch (action.type) {
      case "click": {
        if (action.x === undefined || action.y === undefined) return { ok: false, message: "Missing click position." };
        await execFileAsync("xdotool", ["mousemove", String(Math.round(action.x)), String(Math.round(action.y))]);
        await execFileAsync("xdotool", ["click", "1"]);
        return { ok: true, message: `Did: ${action.reasoning}` };
      }
      case "type": {
        if (!action.text) return { ok: false, message: "Missing text to type." };
        await execFileAsync("xdotool", ["type", "--", action.text]);
        return { ok: true, message: `Did: ${action.reasoning}` };
      }
      case "key": {
        if (!action.key) return { ok: false, message: "Missing key." };
        await execFileAsync("xdotool", ["key", XDOTOOL_KEY_MAP[action.key] ?? action.key]);
        return { ok: true, message: `Did: ${action.reasoning}` };
      }
      case "scroll": {
        const delta = action.y ?? 0;
        const button = delta > 0 ? "5" : "4"; // xdotool's wheel-down/wheel-up button codes
        const clicks = String(Math.max(1, Math.min(10, Math.round(Math.abs(delta) / 40))));
        await execFileAsync("xdotool", ["click", "--repeat", clicks, button]);
        return { ok: true, message: `Did: ${action.reasoning}` };
      }
      default:
        return { ok: false, message: `Unsupported action "${action.type}".` };
    }
  } catch (err) {
    console.error("[automation] linux input failed", err);
    return { ok: false, message: "Couldn't perform that action — is xdotool installed?" };
  }
}
