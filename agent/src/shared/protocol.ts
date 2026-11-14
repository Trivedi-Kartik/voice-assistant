// WebSocket message protocol, Agent <-> Server. Kept platform-agnostic on purpose —
// nothing Electron-specific leaks in here, so a future mobile client speaks the exact
// same protocol. See docs/ARCHITECTURE.md for the full message table.

export type ClientMessage =
  | { type: "auth"; accessToken: string }
  | { type: "audio_chunk"; data: string } // base64 opus chunk
  | { type: "audio_end" }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "resume"; conversationId: string }
  | { type: "automation_observation"; taskId: string; stepIndex: number; screenshot: string }
  | { type: "automation_action_result"; taskId: string; stepIndex: number; result: ToolResult }
  | { type: "automation_cancel"; taskId: string }
  // Cancels the current in-flight turn's tool-calling loop (not automation-
  // specific) — see server/src/toolLoop.ts's cooperative cancellation check.
  | { type: "task_cancel" }
  // Sent once after auth_ok to say which optional features this client build supports. Older clients
  // never send it, so the server keeps behaving exactly as before for them (e.g. no audio).
  | { type: "client_hello"; features: string[] }
  // PC agent (Karvix 2): the device's answer to an agent_request (result shape depends on the kind).
  | { type: "agent_response"; taskId: string; requestId: string; result: unknown }
  // The user stopped the running PC task from the device (overlay Stop / hotkey).
  | { type: "agent_cancel"; taskId: string };

export type ServerMessage =
  | { type: "auth_ok" }
  | { type: "transcript"; text: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  // audioFollows: assistant_audio chunks for this reply will follow (client should play those instead
  // of its local voice).
  | { type: "assistant_text"; text: string; audioFollows?: boolean; replyId?: string }
  // One speech chunk (≈ a sentence) of the reply, in order. `data` (base64 audio) is omitted when the
  // server couldn't synthesize it — the client then speaks `text` with its local voice.
  | { type: "assistant_audio"; replyId: string; seq: number; final: boolean; text: string; data?: string; mimeType?: string }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "automation_start"; taskId: string; goal: string }
  | { type: "automation_action"; taskId: string; stepIndex: number; action: AutomationAction }
  | { type: "automation_stop"; taskId: string }
  // PC agent (Karvix 2): the server asks the device to look, act, or verify; device answers with agent_response.
  | { type: "agent_request"; taskId: string; requestId: string; kind: "observe" | "act" | "verify"; action?: AgentActionWire; expect?: AgentExpectationWire }
  // Progress for the "Karvix is working" UI.
  | { type: "agent_status"; taskId: string; state: "started" | "step" | "waiting" | "ended"; goal?: string; text?: string; ok?: boolean };

export type ErrorCode =
  | "auth_invalid"
  | "auth_expired"
  | "rate_limited"
  | "stt_failed"
  | "llm_failed"
  | "internal";

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

// One computer-use step, decided server-side from a screenshot. "risk":"high"
// gates the step behind a spoken confirmation before the server ever sends it
// here to execute. See docs/ARCHITECTURE.md.
export interface AutomationAction {
  type: "click" | "type" | "key" | "scroll" | "done" | "failed";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  risk: "low" | "high";
  reasoning: string;
}

// PC agent wire shapes (see server/src/agent/types.ts for the full semantics).
export interface AgentExpectationWire {
  windowTitleContains?: string;
  fileExists?: string;
  fileContains?: { path: string; text: string };
  elementNamed?: string;
}

export interface AgentActionWire {
  name: string;
  args: Record<string, unknown>;
  expect?: AgentExpectationWire;
  confirmed?: boolean;
}
