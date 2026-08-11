import { ZodError } from "zod";
import type { ToolDefinition, ToolResult } from "./types.js";
import { openAppTool } from "./openApp.js";
import { closeAppTool } from "./closeApp.js";
import { webSearchTool } from "./webSearch.js";
import { openUrlTool } from "./openUrl.js";
import { controlMediaTool } from "./controlMedia.js";
import { setReminderTool } from "./setReminder.js";
import { readClipboardTool } from "./readClipboard.js";
import { takeScreenshotTool } from "./takeScreenshot.js";
import { TOOL_NAMES } from "../../shared/toolContract.js";

// One file per tool, identical shape (name/parseArgs/execute) — no shared mutable
// state between tools. Adding tool #10 should be exactly as clean as tool #1.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, ToolDefinition<any>> = {
  [openAppTool.name]: openAppTool,
  [closeAppTool.name]: closeAppTool,
  [webSearchTool.name]: webSearchTool,
  [openUrlTool.name]: openUrlTool,
  [controlMediaTool.name]: controlMediaTool,
  [setReminderTool.name]: setReminderTool,
  [readClipboardTool.name]: readClipboardTool,
  [takeScreenshotTool.name]: takeScreenshotTool,
};

// Cheap insurance against silent drift between this registry and
// shared/toolContract.ts (the contract the server also targets, kept in sync by
// hand — see server/src/tools/toolNames.ts).
const registryNames = Object.keys(REGISTRY).sort();
const contractNames = [...TOOL_NAMES].sort();
if (registryNames.length !== contractNames.length || registryNames.some((n, i) => n !== contractNames[i])) {
  throw new Error(`Tool registry drift: registry has [${registryNames}], contract expects [${contractNames}]`);
}

export const SUPPORTED_TOOL_NAMES = registryNames;

const TOOL_TIMEOUT_MS = 10_000;

// Guarantees a ToolResult is ALWAYS produced — parse failure, execution throw, or
// timeout all resolve rather than reject, so the server's tool-calling loop is
// never left waiting on a callId that will never resolve.
export async function dispatchToolCall(name: string, rawArgs: unknown): Promise<ToolResult> {
  const tool = REGISTRY[name];
  if (!tool) {
    return { ok: false, message: `Unknown tool "${name}".` };
  }

  try {
    const args = tool.parseArgs(rawArgs);
    // Confirmation for sensitive tools (close_app, read_clipboard,
    // take_screenshot_and_describe) now happens server-side, as a spoken
    // question resolved by the user's next voice turn — see
    // server/src/ws/session.ts and docs/ARCHITECTURE.md. By the time a
    // tool_call reaches here, it's already been confirmed.
    return await Promise.race([
      tool.execute(args),
      new Promise<ToolResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, message: "Tool timed out" }), TOOL_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    // ZodError.message is a raw JSON array of issues — not something to ever
    // surface verbatim to a user (confirmed via real testing: this leaked
    // as-is before this fix). Its *cause* (safeParseArgs sending non-object
    // args) is fixed in llm.ts, but a validation error here should never
    // look like a crash dump even if some other malformed input slips through.
    const message =
      err instanceof ZodError
        ? "That request didn't look right — try again."
        : err instanceof Error
          ? err.message
          : "Tool failed with an unexpected error.";
    return { ok: false, message };
  }
}
