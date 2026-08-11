import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { lookupApp, knownAppNames } from "./appRegistry.js";

const execFileAsync = promisify(execFile);

const argsSchema = z.object({ app: z.string() });

export const openAppTool: ToolDefinition<{ app: string }> = {
  name: "open_app",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ app }) {
    const entry = lookupApp(app);
    if (!entry) {
      return {
        ok: false,
        message: `"${app}" isn't in the whitelist. Known apps: ${knownAppNames().join(", ")}.`,
      };
    }
    try {
      // Fixed argv passed to execFile — never a raw interpolated string passed to exec().
      await execFileAsync("cmd.exe", ["/c", "start", "", entry.openCommand]);
      return { ok: true, message: `Opened ${app}.` };
    } catch {
      return { ok: false, message: `${app} doesn't seem to be installed on this machine.` };
    }
  },
};
