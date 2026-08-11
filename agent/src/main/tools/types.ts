export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  parseArgs: (raw: unknown) => TArgs;
  execute(args: TArgs): Promise<ToolResult>;
}
