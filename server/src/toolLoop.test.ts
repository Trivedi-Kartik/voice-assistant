import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerMessage, ToolResult } from "./protocol.js";
import type { TaskStepKind } from "./tasks/taskStore.js";
import type { ToolLoopDeps } from "./toolLoop.js";

// Only the two real I/O boundaries this module touches — everything else
// (tools/schemas.ts's CONFIRMATION_PROMPTS/SERVER_TOOL_NAMES,
// i18n/confirmationPrompts.ts, i18n/messages.ts) is left real and
// unmocked, same philosophy as ws/session.test.ts.
vi.mock("./llm.js", () => ({ runLlmStep: vi.fn() }));
vi.mock("./memory/conversationStore.js", () => ({ appendMessage: vi.fn().mockResolvedValue("msg-1") }));

const { runLlmStep } = await import("./llm.js");
const { runToolLoop } = await import("./toolLoop.js");

function llmToolCalls(calls: { id: string; name: string; args: unknown }[]) {
  return { assistantMessage: { role: "assistant" as const, content: "", tool_calls: [] }, toolCalls: calls };
}
function llmText(text: string) {
  return { assistantMessage: { role: "assistant" as const, content: text }, toolCalls: [] };
}

// This is the whole point of the extraction (docs/TARGET_ARCHITECTURE.md §3):
// no Session, no WebSocket, no mocked-module machinery beyond the two real
// I/O calls above — just plain vi.fn()s satisfying the deps interface.
function makeDeps(overrides: Partial<ToolLoopDeps> = {}): ToolLoopDeps & {
  sent: ServerMessage[];
  recordedSteps: { kind: TaskStepKind; toolName?: string; result?: ToolResult }[];
} {
  const sent: ServerMessage[] = [];
  const recordedSteps: { kind: TaskStepKind; toolName?: string; result?: ToolResult }[] = [];
  return {
    apiKey: "test-key",
    language: "en",
    capabilities: [],
    conversationId: "conv-1",
    history: [{ role: "system", content: "system prompt" }],
    userMessageId: "msg-user-1",
    dispatchToolCall: vi.fn().mockResolvedValue({ ok: true, message: "dispatched" }),
    handleServerTool: vi.fn().mockResolvedValue({ ok: true, message: "handled" }),
    speakAndEndTurn: vi.fn().mockResolvedValue(undefined),
    recordTaskStep: (kind, toolName, result) => recordedSteps.push({ kind, toolName, result }),
    send: (msg) => sent.push(msg),
    sent,
    recordedSteps,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runToolLoop (standalone, no Session/WS)", () => {
  it("returns completed and sends the final text when the model replies with no tool calls", async () => {
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("All done."));
    const deps = makeDeps();

    const result = await runToolLoop(deps);

    expect(result).toEqual({ outcome: "completed" });
    expect(deps.sent).toEqual([{ type: "assistant_text", text: "All done." }]);
    expect(deps.dispatchToolCall).not.toHaveBeenCalled();
  });

  it("dispatches a non-gated client tool call directly and continues the loop", async () => {
    vi.mocked(runLlmStep)
      .mockResolvedValueOnce(llmToolCalls([{ id: "c1", name: "web_search", args: { query: "pizza" } }]))
      .mockResolvedValueOnce(llmText("Found some results."));
    const deps = makeDeps();

    const result = await runToolLoop(deps);

    expect(deps.dispatchToolCall).toHaveBeenCalledWith("c1", "web_search", { query: "pizza" });
    expect(result).toEqual({ outcome: "completed" });
    expect(deps.recordedSteps).toContainEqual({
      kind: "tool_call",
      toolName: "web_search",
      result: { ok: true, message: "dispatched" },
    });
  });

  it("routes a server-handled tool through handleServerTool, not dispatchToolCall", async () => {
    vi.mocked(runLlmStep)
      .mockResolvedValueOnce(llmToolCalls([{ id: "c1", name: "remember_preference", args: { fact: "likes pizza" } }]))
      .mockResolvedValueOnce(llmText("Got it."));
    const deps = makeDeps();

    await runToolLoop(deps);

    expect(deps.handleServerTool).toHaveBeenCalledWith("remember_preference", { fact: "likes pizza" }, "msg-user-1");
    expect(deps.dispatchToolCall).not.toHaveBeenCalled();
  });

  it("pauses on a confirmation-gated tool without ever dispatching it", async () => {
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "c1", name: "close_app", args: { app: "chrome" } }])
    );
    const deps = makeDeps();

    const result = await runToolLoop(deps);

    expect(result).toEqual({ outcome: "paused", pendingConfirmation: { name: "close_app", args: { app: "chrome" } } });
    expect(deps.dispatchToolCall).not.toHaveBeenCalled();
    expect(deps.speakAndEndTurn).toHaveBeenCalledWith("Close chrome? Say yes to confirm.");
  });
});
