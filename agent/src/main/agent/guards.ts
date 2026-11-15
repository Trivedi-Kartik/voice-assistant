// Pure, dependency-free safety checks for the device-side agent (unit-tested in agent/test/guards.test.js).

// Windows where typing is effectively "running commands": terminals, shells, remote consoles. A newline typed
// into one executes whatever was typed, so the agent never types or presses keys into them — it uses file and
// app skills instead. (Seen in testing: the planner tried to type `nano ~/file\n` into a terminal.)
const TERMINAL_RE =
  /\b(terminal|konsole|xterm|urxvt|tilix|alacritty|kitty|wezterm|foot|terminator|guake|yakuake|powershell|pwsh|cmd\.exe|command prompt|windows terminal|conhost|putty|mintty|git bash|wsl)\b/i;

export function isTerminalWindow(app?: string, title?: string): boolean {
  return TERMINAL_RE.test(`${app ?? ""} ${title ?? ""}`);
}

// Never let a model-written string through as the text we speak: Groq sometimes returns a fake tool call as
// text ({"name":"json","arguments":{…}}). Pull a human sentence out of it, or give back nothing.
export function humanTextFromRejected(rejected: string): string {
  const trimmed = rejected.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { arguments?: Record<string, unknown> } & Record<string, unknown>;
    const args = (parsed.arguments ?? parsed) as Record<string, unknown>;
    const found = [args.summary, args.reason, args.text, args.message, args.answer].find((v) => typeof v === "string" && v.trim());
    return typeof found === "string" ? found.trim() : "";
  } catch {
    return trimmed;
  }
}

// ---- Web safety (pure, unit-tested) ----

// Buttons/links whose click has real-world consequences. "Add to cart" and "Checkout" are deliberately NOT here:
// the agent may shop right up to the final commitment, and stops at "Place order" / "Pay" / "Send"… for a spoken yes.
const RISKY_WEB_LABEL =
  /\b(place (your |my |the )?order|buy( it)? now|buy|pay( now| securely)?|complete (the )?(purchase|order|payment)|confirm (the )?(order|purchase|payment)|submit (the )?(order|payment)|purchase|send( message| now)?|post|publish|delete( account)?|remove account|close account|unsubscribe|subscribe|transfer( money| funds)?|withdraw|sign ?up|register|create account|donate)\b/i;

export function isRiskyWebLabel(label: string): boolean {
  return RISKY_WEB_LABEL.test(label);
}

// Fields the agent must never type into: credentials and payment/identity details. The user types those
// themselves in the browser window, then tells the agent to continue.
const SECRET_FIELD =
  /\b(password|passcode|passwd|pin|otp|one[- ]time|verification code|security code|cvv|cvc|card[- ]?number|credit card|cc-(number|csc|exp)|iban|routing number|ssn|social security)\b/i;

export function isSecretField(info: { type?: string; name?: string; autocomplete?: string; label?: string }): boolean {
  if ((info.type ?? "").toLowerCase() === "password") return true;
  return SECRET_FIELD.test(`${info.name ?? ""} ${info.autocomplete ?? ""} ${info.label ?? ""}`);
}

// Only ordinary web pages. file:, javascript:, data:, chrome: etc. are refused (local file access, script injection,
// browser internals).
export function checkWebUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: `"${raw}" isn't a web address.` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, message: `I only open http(s) pages, not ${u.protocol}.` };
  return { ok: true, url: u.toString() };
}
