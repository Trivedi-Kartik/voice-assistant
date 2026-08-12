import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { lookupApp, knownAppNames } from "./appRegistry.js";
import { openViaPlatform } from "./appExec.js";

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
    const opened = await openViaPlatform(entry);
    return opened
      ? { ok: true, message: `Opened ${app}.` }
      : { ok: false, message: `${app} doesn't seem to be installed on this machine.` };
  },
};
