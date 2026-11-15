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
