import type { AgentAction } from "./types.js";
import { confirmPrompt } from "./confirmPrompts.js";

// Mirrors agent/src/main/agent/guards.ts isRiskyShortcut by hand (separate packages).
export function isRiskyShortcut(keys: string[]): boolean {
  const k = keys.map((x) => x.toLowerCase().trim());
  const has = (n: string) => k.includes(n);
  if (has("alt") && (has("f4") || has("tab"))) return true;
  if ((has("ctrl") || has("control")) && (has("w") || has("q") || has("f4") || has("d"))) return true;
  if (has("super") || has("win") || has("meta")) return true;
  if (has("shift") && has("delete")) return true;
  if (has("delete") && k.length === 1) return true;
  return false;
}

// Deterministic safety gate (plan §3.5). It never trusts the model's own judgement of risk: anything
// that deletes, sends, buys, submits or could expose credentials stops for an explicit spoken "yes",
// with the exact target read back. The desktop client re-checks with local knowledge (e.g. whether a
// file being overwritten exists) and can also demand confirmation.

export type SafetyDecision = { level: "allow" } | { level: "confirm"; prompt: string } | { level: "block"; reason: string };

// Words on a button/element that mean "this has real-world consequences". English UI terms; the
// client's element names come from the OS in the UI language, so other languages are a known gap.
const RISKY_ELEMENT = /\b(buy|pay|purchase|place order|checkout|check out|order now|send|post|publish|submit|delete|remove|erase|transfer|confirm|sign up|subscribe|uninstall|format)\b/i;
const SECRET_HINT = /\b(password|passcode|pin|otp|one[- ]time|cvv|cvc|card number|iban|routing|ssn)\b/i;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function classifyAction(action: AgentAction, elementLabel?: string, language = "en"): SafetyDecision {
  if (action.confirmed) return { level: "allow" };
  const a = action.args;
  switch (action.name) {
    case "clipboard_read":
      // The clipboard often holds passwords and private text.
      return { level: "confirm", prompt: confirmPrompt("clipboard", "", language) };
    case "system_setting": {
      // Turning Wi-Fi/Bluetooth off can cut the user off from Karvix (or their headphones); locking the screen
      // locks them out mid-task.
      const setting = s(a.setting);
      const off = /^(off|false|disable|disabled|no|0)$/i.test(s(a.value));
      if (setting === "lock_screen") return { level: "confirm", prompt: confirmPrompt("setting", "Lock the screen", language) };
      if ((setting === "wifi" || setting === "bluetooth") && off) {
        return { level: "confirm", prompt: confirmPrompt("setting", `Turn ${setting === "wifi" ? "Wi-Fi" : "Bluetooth"} off`, language) };
      }
      return { level: "allow" };
    }
    case "file_delete":
      return { level: "confirm", prompt: confirmPrompt("delete", s(a.path), language) };
    case "click": {
      const label = elementLabel ?? s(a.element);
      if (RISKY_ELEMENT.test(label)) return { level: "confirm", prompt: confirmPrompt("click", label, language) };
      return { level: "allow" };
    }
    case "hotkey": {
      const keys = Array.isArray(a.keys) ? a.keys.map((k) => String(k).toLowerCase()) : [];
      // Shortcuts that close windows, quit apps, open system menus or delete.
      if (keys.includes("delete") && keys.includes("shift")) return { level: "confirm", prompt: confirmPrompt("shift_delete", "", language) };
      if (isRiskyShortcut(keys)) return { level: "confirm", prompt: confirmPrompt("shortcut", keys.join("+"), language) };
      return { level: "allow" };
    }
    case "type_text":
    case "set_text": {
      const target = `${elementLabel ?? ""} ${s(a.element)}`;
      // The agent must never type secrets; the user does that themselves.
      if (SECRET_HINT.test(target)) return { level: "block", reason: "I won't type passwords or payment details — please enter that yourself, then tell me to continue." };
      return { level: "allow" };
    }
    default:
      return { level: "allow" };
  }
}
