// Single source of truth for tool name strings. Both the client's tool registry
// (agent/src/main/tools/index.ts) and the server's tool schemas
// (server/src/tools/schemas.ts) must match this list exactly — a one-line test on
// each side asserts that, as cheap insurance against silent drift.

export const TOOL_NAMES = [
  "open_app",
  "close_app",
  "web_search",
  "open_url",
  "control_media",
  "set_reminder",
  "read_clipboard",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
