import { shell } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const argsSchema = z.object({ url: z.string().url() });

export const openUrlTool: ToolDefinition<{ url: string }> = {
  name: "open_url",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ url }) {
    const parsed = new URL(url);
    // Only http(s) — blocks file://, javascript:, and custom protocol handlers.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, message: `Refusing to open a non-http(s) URL (${parsed.protocol}).` };
    }
    await shell.openExternal(url);
    return { ok: true, message: `Opened ${url}.` };
  },
};
