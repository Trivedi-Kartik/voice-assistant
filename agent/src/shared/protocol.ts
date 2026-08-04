// WebSocket message protocol, Agent <-> Server. Kept platform-agnostic on purpose —
// nothing Electron-specific leaks in here, so a future mobile client speaks the exact
// same protocol. See docs/ARCHITECTURE.md for the full message table.

export type ClientMessage =
  | { type: "auth"; accessToken: string }
  | { type: "audio_chunk"; data: string } // base64 opus chunk
  | { type: "audio_end" }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "resume"; conversationId: string };

export type ServerMessage =
  | { type: "auth_ok" }
  | { type: "transcript"; text: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "assistant_text"; text: string }
  | { type: "assistant_audio"; data: string; mimeType: string } // reserved, unused in v1 (browser SpeechSynthesis)
  | { type: "error"; code: ErrorCode; message: string };

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
