// Server-side mirror of agent/src/shared/protocol.ts. Kept in sync by hand (same
// reasoning as tools/toolNames.ts — server and agent are separately built/deployed
// packages, not a shared workspace). Keep both files identical in shape.

export type ClientMessage =
  | { type: "auth"; accessToken: string }
  | { type: "audio_chunk"; data: string }
  | { type: "audio_end" }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "resume"; conversationId: string }
  | { type: "automation_observation"; taskId: string; stepIndex: number; screenshot: string }
  | { type: "automation_action_result"; taskId: string; stepIndex: number; result: ToolResult }
  | { type: "automation_cancel"; taskId: string }
  | { type: "task_cancel" }
  // Sent once after auth_ok to say which optional features this client build supports. Older clients
  // never send it, so the server keeps behaving exactly as before for them (e.g. no audio).
  | { type: "client_hello"; features: string[] };

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
  | { type: "automation_stop"; taskId: string };

export type ErrorCode = "auth_invalid" | "auth_expired" | "rate_limited" | "stt_failed" | "llm_failed" | "internal";

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

// One computer-use step, decided by automation/vision.ts's vision model from a
// screenshot. "risk":"high" gates the step behind a spoken confirmation (see
// ws/session.ts) before it's ever sent to the client to execute.
export interface AutomationAction {
  type: "click" | "type" | "key" | "scroll" | "done" | "failed";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  risk: "low" | "high";
  reasoning: string;
}
