import { describe, expect, it } from "vitest";
import { parseClientMessage, MAX_AUDIO_CHUNK_B64 } from "./clientMessage.js";

const p = (o: unknown) => parseClientMessage(JSON.stringify(o));

describe("parseClientMessage", () => {
  it("accepts every well-formed message type", () => {
    expect(p({ type: "audio_chunk", data: "AAAA" })).toEqual({ type: "audio_chunk", data: "AAAA" });
    expect(p({ type: "audio_end" })).toEqual({ type: "audio_end" });
    expect(p({ type: "task_cancel" })).toEqual({ type: "task_cancel" });
    expect(p({ type: "client_hello", features: ["assistant_audio"] })).toEqual({ type: "client_hello", features: ["assistant_audio"] });
    expect(p({ type: "tool_result", callId: "c1", result: { ok: true, message: "hi" } })).not.toBeNull();
    expect(p({ type: "resume", conversationId: "abc" })).not.toBeNull();
    expect(p({ type: "automation_cancel", taskId: "t" })).not.toBeNull();
    expect(p({ type: "automation_observation", taskId: "t", stepIndex: 0, screenshot: "x" })).not.toBeNull();
    expect(p({ type: "automation_action_result", taskId: "t", stepIndex: 1, result: { ok: false, message: "m" } })).not.toBeNull();
  });

  it("rejects the malformed tool_result that used to hang a turn (missing/null result)", () => {
    expect(p({ type: "tool_result", callId: "c1" })).toBeNull();
    expect(p({ type: "tool_result", callId: "c1", result: null })).toBeNull();
    expect(p({ type: "tool_result", callId: "c1", result: { ok: "yes", message: "m" } })).toBeNull();
  });

  it("rejects non-JSON, unknown types and wrong field types", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage("null")).toBeNull();
    expect(p({ type: "nope" })).toBeNull();
    expect(p({ type: "audio_chunk", data: 123 })).toBeNull();
    expect(p({ type: "automation_action_result", taskId: "t", stepIndex: -1, result: { ok: true, message: "" } })).toBeNull();
  });

  it("rejects an oversized audio chunk", () => {
    expect(p({ type: "audio_chunk", data: "A".repeat(MAX_AUDIO_CHUNK_B64 + 1) })).toBeNull();
  });
});
