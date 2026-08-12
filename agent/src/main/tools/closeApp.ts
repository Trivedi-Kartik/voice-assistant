import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { lookupApp } from "./appRegistry.js";
import { closeViaPlatform } from "./appExec.js";

const argsSchema = z.object({ app: z.string() });

export const closeAppTool: ToolDefinition<{ app: string }> = {
  name: "close_app",
  // First tool that can involuntarily kill a running program (and any unsaved
  // work in it) — gated by a spoken confirmation the user resolves on the
  // next turn (see server/src/ws/session.ts, CONFIRMATION_PROMPTS in
  // server/src/tools/schemas.ts). By the time this execute() runs, it's
  // already been confirmed. See docs/ARCHITECTURE.md.
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ app }) {
    const entry = lookupApp(app);
    if (!entry?.processName) {
      return { ok: false, message: `"${app}" can't be closed this way.` };
    }
    const closed = await closeViaPlatform(entry.processName);
    return closed
      ? { ok: true, message: `Closed ${app}.` }
      : { ok: false, message: `${app} doesn't seem to be running.` };
  },
};
