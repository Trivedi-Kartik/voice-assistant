import { TOOL_NAMES } from "./toolNames.js";
import { TOOL_DEFINITIONS, type ToolDefinition } from "./toolDefinitions.js";

// Shared shape for both client-executed (GROQ_TOOL_SCHEMAS) and server-handled
// (SERVER_TOOL_SCHEMAS) tools — lets llm.ts accept either/both without TS
// inferring two incompatible literal array types from separate object literals.
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

// Phase 2 (Tool Fabric): every export below is now *derived* from the single
// canonical TOOL_DEFINITIONS list in toolDefinitions.ts, instead of being
// hand-written separately here. Names, descriptions, and parameters are
// byte-identical to what this file used to hand-write — only the source of
// truth moved. See docs/IMPLEMENTATION_ROADMAP.md Phase 2.
function toSchema(t: ToolDefinition): ToolSchema {
  return {
    type: "function" as const,
    function: { name: t.id, description: t.description, parameters: t.inputSchema },
  };
}

// Tool schemas offered to the Groq tool-calling LLM. Names MUST exactly match
// agent/src/shared/toolContract.ts (kept in sync by hand, see toolNames.ts) and the
// client's tool registry (agent/src/main/tools/index.ts) — the LLM only ever picks
// from this fixed, typed set, never a raw command string. See docs/ARCHITECTURE.md.
export const GROQ_TOOL_SCHEMAS: ToolSchema[] = TOOL_DEFINITIONS.filter((t) => t.kind === "client").map(toSchema);

// Server-handled tools (Phase 2) — these never round-trip to the client at all,
// unlike GROQ_TOOL_SCHEMAS above. They don't touch the user's OS, so there's
// nothing for a device to "implement" — always offered regardless of
// Device.capabilities. See ws/session.ts for where these get dispatched
// differently from client tools.
export const SERVER_TOOL_SCHEMAS: ToolSchema[] = TOOL_DEFINITIONS.filter((t) => t.kind === "server").map(toSchema);

export const SERVER_TOOL_NAMES = new Set(SERVER_TOOL_SCHEMAS.map((s) => s.function.name));

// Computer-use automation — a screenshot -> decide-action -> execute loop that
// can click/type/scroll anywhere on screen (see server/src/automation/). Kept
// out of GROQ_TOOL_SCHEMAS/TOOL_NAMES deliberately: unlike every other client
// tool, this one never resolves via a single dispatchToolCall/tool_result
// round-trip through the client's plain tool REGISTRY — its execution is a
// bounded multi-step WS conversation of its own (see ws/session.ts,
// automation/runner.ts), so it has no place in the registry-schema symmetry
// check that assertSchemasMatchContract() enforces for the other 9.
export const AUTOMATION_TOOL_SCHEMAS: ToolSchema[] = TOOL_DEFINITIONS.filter((t) => t.kind === "automation").map(
  toSchema
);

// PC agent (Karvix 2): offered only to clients that announce the "pc_agent" feature (client_hello). Those
// clients get it INSTEAD of the old screenshot-clicking computer_use_task (plan §6 Phase 1: old path kept
// behind a flag for older builds).
export const AGENT_TOOL_SCHEMAS: ToolSchema[] = TOOL_DEFINITIONS.filter((t) => t.kind === "agent").map(toSchema);
export const AGENT_TOOL_NAMES = new Set(AGENT_TOOL_SCHEMAS.map((s) => s.function.name));
export const PC_AGENT_FEATURE = "pc_agent";

// The server-side replacement for what each tool's client-side describe()
// used to do for the deleted dialog.showMessageBox gate — these tools now get
// a spoken confirmation question (see ws/session.ts) instead of a popup.
// Presence in this map, not a "sensitivity" field, is what makes a tool call
// pause for confirmation. Derived from TOOL_DEFINITIONS' riskLevel/
// confirmationPrompt fields — a tool is in here iff riskLevel !== "low".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONFIRMATION_PROMPTS: Partial<Record<string, (args: any) => string>> = Object.fromEntries(
  TOOL_DEFINITIONS.filter((t) => t.confirmationPrompt).map((t) => [t.id, t.confirmationPrompt!])
);

function assertSchemasMatchContract() {
  const schemaNames = GROQ_TOOL_SCHEMAS.map((s) => s.function.name).sort();
  const contractNames = [...TOOL_NAMES].sort();
  const matches =
    schemaNames.length === contractNames.length && schemaNames.every((n, i) => n === contractNames[i]);
  if (!matches) {
    throw new Error(
      `Tool schema/name drift: server schemas [${schemaNames}] vs shared contract [${contractNames}]`
    );
  }
}
assertSchemasMatchContract();

// Filters the full schema set down to what a specific device actually implements
// (Device.capabilities) — keeps the "server only knows names/schemas, client
// hardcodes execution" boundary intact across platforms with different tool support.
export function toolSchemasForCapabilities(capabilities: string[]) {
  return GROQ_TOOL_SCHEMAS.filter((s) => capabilities.includes(s.function.name));
}
