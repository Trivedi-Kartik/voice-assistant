export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

// Phase 2 (Tool Fabric) — hand-duplicated from server/src/tools/toolDefinitions.ts's
// RiskLevel, same cross-package-sync precedent as shared/toolContract.ts (server/
// agent are separately built/deployed, no shared workspace). See
// docs/IMPLEMENTATION_ROADMAP.md Phase 2.
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  riskLevel: RiskLevel;
  // Plain tags describing what this tool actually touches today — mirrors the
  // server-side registry's `permissions` field. Inert metadata for now, not
  // yet consumed by dispatchToolCall(); gives a future policy engine
  // something real to read instead of nothing.
  permissions: string[];
  parseArgs: (raw: unknown) => TArgs;
  execute(args: TArgs): Promise<ToolResult>;
  // Reserved for Phase 5 (the outcome-verifier phase) — no tool implements
  // this yet; deliberately left unset everywhere today.
  verify?: (args: TArgs, result: ToolResult) => Promise<{ ok: boolean; message: string }>;
}
