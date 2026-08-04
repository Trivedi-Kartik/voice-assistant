import type { ToolDefinition, ToolResult } from "./types.js";
import { openAppTool } from "./openApp.js";
import { webSearchTool } from "./webSearch.js";
import { openUrlTool } from "./openUrl.js";
import { TOOL_NAMES } from "../../shared/toolContract.js";

// One file per tool, identical shape (name/parseArgs/execute) — no shared mutable
// state between tools. Adding tool #10 should be exactly as clean as tool #1.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, ToolDefinition<any>> = {
  [openAppTool.name]: openAppTool,
  [webSearchTool.name]: webSearchTool,
  [openUrlTool.name]: openUrlTool,
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
    return await Promise.race([
      tool.execute(args),
      new Promise<ToolResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, message: "Tool timed out" }), TOOL_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Tool failed with an unexpected error.",
    };
  }
}
