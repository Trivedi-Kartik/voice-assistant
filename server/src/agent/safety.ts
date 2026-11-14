import type { AgentAction } from "./types.js";

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

export function classifyAction(action: AgentAction, elementLabel?: string): SafetyDecision {
  if (action.confirmed) return { level: "allow" };
  const a = action.args;
  switch (action.name) {
    case "file_delete":
      return { level: "confirm", prompt: `Move ${s(a.path)} to the Trash? Say yes to confirm.` };
    case "click": {
      const label = elementLabel ?? s(a.element);
      if (RISKY_ELEMENT.test(label)) return { level: "confirm", prompt: `Click "${label}"? That may send, buy or delete something. Say yes to confirm.` };
      return { level: "allow" };
    }
    case "hotkey": {
      const keys = Array.isArray(a.keys) ? a.keys.map((k) => String(k).toLowerCase()) : [];
      // Delete-ish shortcuts on a selection.
      if (keys.includes("delete") && keys.includes("shift")) return { level: "confirm", prompt: "Permanently delete the selected item? Say yes to confirm." };
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
