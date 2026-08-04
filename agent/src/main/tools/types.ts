export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  // Sensitivity is unused by any v1 tool (all are 'low') but wired through now so
  // adding a 'high' sensitivity tool later (e.g. send an email) just means adding a
  // dialog.showMessageBox confirmation gate in the registry — not inventing new
  // plumbing under pressure. See docs/ARCHITECTURE.md.
  sensitivity: "low" | "high";
  parseArgs: (raw: unknown) => TArgs;
  execute(args: TArgs): Promise<ToolResult>;
}
