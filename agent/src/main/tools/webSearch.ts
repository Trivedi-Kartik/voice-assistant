import { shell } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const argsSchema = z.object({ query: z.string().min(1) });

export const webSearchTool: ToolDefinition<{ query: string }> = {
  name: "web_search",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ query }) {
    // Only ever opens a browser tab — never scrapes the result page's content back
    // into the conversation. That's what keeps this tool outside the prompt-injection
    // surface (see docs/ARCHITECTURE.md "no untrusted text into LLM context").
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await shell.openExternal(url);
    return { ok: true, message: `Searching for "${query}".` };
  },
};
