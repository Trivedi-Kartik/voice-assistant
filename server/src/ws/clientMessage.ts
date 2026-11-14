import { z } from "zod";
import type { ClientMessage } from "../protocol.js";

// Runtime validation for everything a client can send over the WebSocket. Before this, frames
// were `JSON.parse`d and cast to ClientMessage, so a malformed frame (a tool_result with no
// `result`, a non-string audio chunk…) threw deep inside session logic — in the worst case after
// a pending tool call had already been removed, leaving the turn (and the user's turn lock)
// waiting forever. Invalid frames are now dropped at the door.

// Generous but finite: a base64 screenshot is a few MB; nothing legitimate is near these.
export const MAX_AUDIO_CHUNK_B64 = 2 * 1024 * 1024;
export const MAX_SCREENSHOT_B64 = 16 * 1024 * 1024;

const toolResult = z.object({
  ok: z.boolean(),
  message: z.string().max(100_000),
  data: z.unknown().optional(),
});

const id = z.string().min(1).max(200);

const clientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), accessToken: z.string().max(10_000) }),
  z.object({ type: z.literal("audio_chunk"), data: z.string().max(MAX_AUDIO_CHUNK_B64) }),
  z.object({ type: z.literal("audio_end") }),
  z.object({ type: z.literal("tool_result"), callId: id, result: toolResult }),
  z.object({ type: z.literal("resume"), conversationId: id }),
  z.object({
    type: z.literal("automation_observation"),
    taskId: id,
    stepIndex: z.number().int().nonnegative(),
    screenshot: z.string().max(MAX_SCREENSHOT_B64),
  }),
  z.object({
    type: z.literal("automation_action_result"),
    taskId: id,
    stepIndex: z.number().int().nonnegative(),
    result: toolResult,
  }),
  z.object({ type: z.literal("automation_cancel"), taskId: id }),
  z.object({ type: z.literal("task_cancel") }),
]);

// Returns null for anything that isn't valid JSON or isn't a well-formed ClientMessage.
export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessage.safeParse(json);
  return parsed.success ? (parsed.data as ClientMessage) : null;
}
