import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

// Fixed whitelist map: the LLM can only ever supply an app NAME, never a path or
// raw command. Add more apps here as needed — never make this dynamic/arbitrary.
const APP_MAP: Record<string, string> = {
  chrome: "chrome",
  edge: "msedge",
  notepad: "notepad",
  vscode: "code",
  spotify: "spotify:",
  calculator: "calc",
};

const argsSchema = z.object({ app: z.string() });

export const openAppTool: ToolDefinition<{ app: string }> = {
  name: "open_app",
  sensitivity: "low",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ app }) {
    const command = APP_MAP[app.toLowerCase().trim()];
    if (!command) {
      return {
        ok: false,
        message: `"${app}" isn't in the whitelist. Known apps: ${Object.keys(APP_MAP).join(", ")}.`,
      };
    }
    try {
      // Fixed argv passed to execFile — never a raw interpolated string passed to exec().
      await execFileAsync("cmd.exe", ["/c", "start", "", command]);
      return { ok: true, message: `Opened ${app}.` };
    } catch {
      return { ok: false, message: `${app} doesn't seem to be installed on this machine.` };
    }
  },
};
