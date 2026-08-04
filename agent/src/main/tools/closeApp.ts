import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { lookupApp } from "./appRegistry.js";

const execFileAsync = promisify(execFile);

const argsSchema = z.object({ app: z.string() });

export const closeAppTool: ToolDefinition<{ app: string }> = {
  name: "close_app",
  // First tool that can involuntarily kill a running program (and any unsaved
  // work in it) — gated by the confirmation dialog in tools/index.ts before
  // execute() ever runs. See docs/ARCHITECTURE.md.
  sensitivity: "high",
  describe: ({ app }) => `Close ${app}?`,
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ app }) {
    const entry = lookupApp(app);
    if (!entry?.processName) {
      return { ok: false, message: `"${app}" can't be closed this way.` };
    }
    try {
      // Fixed argv passed to execFile — never a raw interpolated string passed to exec().
      await execFileAsync("taskkill", ["/IM", entry.processName, "/F"]);
      return { ok: true, message: `Closed ${app}.` };
    } catch {
      return { ok: false, message: `${app} doesn't seem to be running.` };
    }
  },
};
