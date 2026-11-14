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
    isCancelled: () => false,
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

  it("stops after a cancellation arrives mid-flight, without taking another step", async () => {
    vi.mocked(runLlmStep)
      .mockResolvedValueOnce(llmToolCalls([{ id: "c1", name: "web_search", args: { query: "pizza" } }]))
      .mockResolvedValueOnce(llmText("this should never be reached"));
    let cancelled = false;
    const deps = makeDeps({
      // Simulates a task_cancel arriving over the WS while this tool call
      // was still in flight — same real trigger as App.tsx's endSession()
      // now calling window.jarvis.conversation.cancelTask().
      dispatchToolCall: vi.fn().mockImplementation(async () => {
        cancelled = true;
        return { ok: true, message: "dispatched" };
      }),
      isCancelled: () => cancelled,
    });

    const result = await runToolLoop(deps);

    expect(result).toEqual({ outcome: "cancelled" });
    expect(vi.mocked(runLlmStep)).toHaveBeenCalledTimes(1); // never took a second step
    expect(deps.speakAndEndTurn).not.toHaveBeenCalled(); // never asks a confirmation question after cancelling
  });

  it("never even makes the first LLM call if already cancelled", async () => {
    const deps = makeDeps({ isCancelled: () => true });

    const result = await runToolLoop(deps);

    expect(result).toEqual({ outcome: "cancelled" });
    expect(runLlmStep).not.toHaveBeenCalled();
  });
});

describe("runToolLoop — Karvix 2 PC agent", () => {
  // clearAllMocks doesn't drop queued mockResolvedValueOnce values left unconsumed by earlier tests.
  beforeEach(() => vi.mocked(runLlmStep).mockReset());
  const offered = () => (vi.mocked(runLlmStep).mock.calls[0][2] as { function: { name: string } }[]).map((t) => t.function.name);

  it("offers pc_task instead of the old computer_use_task to clients announcing pc_agent", async () => {
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("ok"));
    await runToolLoop(makeDeps({ capabilities: ["open_app", "pc_agent"] }));
    expect(offered()).toContain("pc_task");
    expect(offered()).not.toContain("computer_use_task");
  });

  it("keeps the old computer_use_task for older clients (no pc_agent feature)", async () => {
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("ok"));
    await runToolLoop(makeDeps({ capabilities: ["open_app"] }));
    expect(offered()).toContain("computer_use_task");
    expect(offered()).not.toContain("pc_task");
  });

  it("routes pc_task to the server handler and, when it pauses, speaks its question verbatim and ends the turn", async () => {
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmToolCalls([{ id: "t1", name: "pc_task", args: { goal: "edit my list" } }]));
    const deps = makeDeps({
      capabilities: ["pc_agent"],
      handleServerTool: vi.fn().mockResolvedValue({ ok: true, message: "Paused", data: { speakAndPause: "Which list do you mean?" } }),
    });
    const result = await runToolLoop(deps);
    expect(result).toEqual({ outcome: "paused" });
    expect(deps.handleServerTool).toHaveBeenCalledWith("pc_task", { goal: "edit my list" }, "msg-user-1");
    expect(deps.dispatchToolCall).not.toHaveBeenCalled();
    expect(deps.speakAndEndTurn).toHaveBeenCalledWith("Which list do you mean?");
    // The pc_task call is answered in history before pausing (no dangling tool_calls).
    expect(deps.history.at(-1)).toMatchObject({ role: "tool", tool_call_id: "t1" });
    expect(runLlmStep).toHaveBeenCalledTimes(1);
  });
});
