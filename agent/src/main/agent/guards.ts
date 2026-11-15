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

// System permission / authentication dialogs (screen-sharing and remote-control consent, admin password prompts,
// keyring unlock). Only the human may answer those — the agent never clicks or types into them, otherwise it could
// grant itself access.
const SYSTEM_DIALOG_APP = /^(xdg-desktop-portal(-gnome|-gtk|-kde)?|polkit-gnome-authentication-agent-1|polkit-kde-authentication-agent-1|gcr-prompter|consent\.exe|credentialuibroker\.exe)$/i;
const SYSTEM_DIALOG_TITLE = /\b(authentication required|authenticate|unlock (login )?keyring|allow remote (interaction|desktop|control)|screen sharing|share (your )?screen|user account control)\b/i;

export function isSystemPermissionDialog(app?: string, title?: string): boolean {
  return SYSTEM_DIALOG_APP.test((app ?? "").trim()) || SYSTEM_DIALOG_TITLE.test(title ?? "");
}

// ---- Web safety (pure, unit-tested) ----

// Buttons/links whose click has real-world consequences. "Add to cart" and "Checkout" are deliberately NOT here:
// the agent may shop right up to the final commitment, and stops at "Place order" / "Pay" / "Send"… for a spoken yes.
// English uses word boundaries; the other supported languages' stems match anywhere (JS \b doesn't work for non-Latin
// scripts). A label is still page/app-controlled text, so this is one signal among several (see structural checks).
const RISKY_WEB_LABEL = new RegExp(
  "\\b(place (your |my |the )?order|buy( it)? now|buy|pay( now| securely)?|complete (the )?(purchase|order|payment)|confirm (the )?(order|purchase|payment)|submit (the )?(order|payment)|purchase|send( message| now)?|post|publish|delete( account)?|remove account|close account|unsubscribe|subscribe|transfer( money| funds)?|withdraw|sign ?up|register|create account|donate|reply|forward|share)\\b" +
    "|comprar|pagar|enviar|eliminar|borrar|suscribir|donar|acheter|payer|envoyer|supprimer|effacer|virement|kaufen|bezahlen|senden|löschen|bestell|überweis|comprare|pagare|inviare|elimina|cancella|acquista|ordina|excluir|apagar|finalizar compra|खरीद|भुगतान|भेज|हटा|मिटा|ऑर्डर|ซื้อ|ชำระ|จ่าย|ส่ง|ลบ|สั่งซื้อ",
  "i"
);

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

// ---- Files: never create or open something that can RUN ----
// An injected instruction could write ~/Desktop/x.bat and then "open" it (which executes it), or drop a script into a
// startup folder. Executable/script types are refused for create/move/copy destinations and for file_open.
const EXECUTABLE_EXT = new Set([
  "exe", "com", "bat", "cmd", "scr", "msi", "msp", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "url", "reg", "jar",
  "dll", "cpl", "pif", "gadget", "sh", "bash", "zsh", "fish", "py", "pl", "rb", "php", "desktop", "appimage", "run", "bin", "command", "app", "workflow", "scpt", "deb", "rpm", "dmg", "pkg",
]);

export function isExecutablePath(p: string): boolean {
  const base = p.replace(/\\/g, "/").split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXECUTABLE_EXT.has(ext);
}

// ---- Keyboard shortcuts that close things, quit, or open system menus ----
export function isRiskyShortcut(keys: string[]): boolean {
  const k = keys.map((x) => x.toLowerCase().trim());
  const has = (n: string) => k.includes(n);
  if (has("alt") && (has("f4") || has("tab"))) return true;
  if ((has("ctrl") || has("control")) && (has("w") || has("q") || has("f4") || has("d"))) return true;
  if (has("super") || has("win") || has("meta")) return true; // run dialog / launcher / lock
  if (has("shift") && has("delete")) return true;
  if (has("delete") && k.length === 1) return true;
  return false;
}

// Enter submits forms and sends chat messages. It's only harmless in a search/address field.
export function enterNeedsConfirmation(focused?: { role?: string; type?: string; name?: string }): boolean {
  if (!focused) return true; // can't tell what has focus -> don't risk a send
  if ((focused.type ?? "").toLowerCase() === "search") return false;
  return !/\b(search|find|query|filter|go to|address|url)\b/i.test(focused.name ?? "");
}
