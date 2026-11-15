// Karvix 2 "PC agent" kernel — shared types. See docs/PC_CONTROL_PLAN.md §3.
// The runner talks to the user's computer ONLY through AgentDevice, so the same loop runs against the
// real desktop client (over the WebSocket), a simulated device in tests, or a local device in the eval.

export interface Observation {
  platform?: string; // "win32" | "linux" | ...
  activeWindow?: { title: string; app?: string };
  windows?: { title: string; app?: string }[];
  // Pruned accessibility tree as text with short element ids, e.g. `[12] Button "Save"` (Phase 2/4).
  elements?: string;
  // Free-form facts the client wants the planner to know (e.g. "home folder: /home/kartik").
  notes?: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
  // The client's own safety gate refused to run this without explicit confirmation (e.g. overwriting
  // an existing file). `prompt` is what to ask the user.
  // kind/target let the server phrase the question in the user's language; prompt is the client's English fallback.
  needsConfirmation?: { prompt: string; kind?: "delete" | "overwrite" | "click" | "screen"; target?: string };
  observation?: Observation; // fresh state after the action, when cheap to include
}

export interface Expectation {
  windowTitleContains?: string;
  fileExists?: string;
  fileContains?: { path: string; text: string };
  elementNamed?: string;
}

export interface VerifyResult {
  ok: boolean;
  detail: string;
}

export interface AgentAction {
  name: string; // one of AGENT_ACTIONS
  args: Record<string, unknown>;
  expect?: Expectation;
  confirmed?: boolean; // set by the runner only after the user said yes
}

export interface AgentDevice {
  observe(): Promise<Observation>;
  act(action: AgentAction): Promise<ActionResult>;
  verify(expect: Expectation): Promise<VerifyResult>;
}

export type AgentOutcome =
  | { kind: "done"; summary: string }
  | { kind: "failed"; reason: string }
  | { kind: "ask"; question: string }
  | { kind: "confirm"; prompt: string }
  | { kind: "cancelled" };

export interface AgentStatus {
  state: "started" | "step" | "waiting" | "ended";
  goal?: string;
  text?: string;
  ok?: boolean;
}
