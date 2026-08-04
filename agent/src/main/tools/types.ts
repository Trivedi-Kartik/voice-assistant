export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  // 'high' sensitivity tools (first: close_app) go through a
  // dialog.showMessageBox confirmation gate in the registry (tools/index.ts)
  // before execute() ever runs. See docs/ARCHITECTURE.md.
  sensitivity: "low" | "high";
  // Human-readable confirmation prompt for 'high' sensitivity tools, e.g.
  // "Close Chrome?" instead of raw tool-name/args JSON. Unused by 'low' tools.
  describe?: (args: TArgs) => string;
  parseArgs: (raw: unknown) => TArgs;
  execute(args: TArgs): Promise<ToolResult>;
}
