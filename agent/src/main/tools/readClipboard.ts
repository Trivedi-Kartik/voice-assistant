import { clipboard } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

// Whatever's on the clipboard could be a password, an OTP, anything — unlike
// the other 'high' sensitivity tool (close_app), this isn't about
// irreversible damage, it's about not silently shipping private data to a
// cloud LLM. Same Allow/Deny gate either way. See docs/ARCHITECTURE.md.
const MAX_CHARS = 4_000;

const argsSchema = z.object({});

export const readClipboardTool: ToolDefinition<Record<string, never>> = {
  name: "read_clipboard",
  sensitivity: "high",
  describe: () => "Share your clipboard contents with the assistant?",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute() {
    const text = clipboard.readText().trim();
    if (!text) {
      return { ok: false, message: "The clipboard is empty." };
    }
    const truncated = text.length > MAX_CHARS;
    return { ok: true, message: truncated ? `${text.slice(0, MAX_CHARS)}… (truncated)` : text };
  },
};
