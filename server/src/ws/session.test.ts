import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerMessage, ToolResult } from "../protocol.js";

// Mock every I/O boundary Session touches. Left REAL and unmocked deliberately:
// i18n/confirmation.ts (classifyConfirmation — this is exactly the logic that
// had the trailing-punctuation bug), i18n/confirmationPrompts.ts,
// i18n/messages.ts, i18n/languages.ts, tools/schemas.ts (CONFIRMATION_PROMPTS,
// SERVER_TOOL_NAMES, AUTOMATION_TOOL_SCHEMAS — the actual gate logic under
// test), tools/toolNames.ts, ws/userLock.ts (pure in-memory, no I/O).
vi.mock("../stt.js", () => ({ transcribeAudio: vi.fn() }));
vi.mock("../llm.js", () => ({ runLlmStep: vi.fn() }));
vi.mock("../groqKey.js", () => ({
  resolveGroqKey: vi.fn().mockResolvedValue({ apiKey: "test-key", isByok: false }),
}));
vi.mock("../rateLimit.js", () => ({
  checkAndConsumeTurn: vi.fn().mockResolvedValue({ allowed: true }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../redis.js", () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") },
  conversationKey: (userId: string, conversationId: string) => `conv:${userId}:${conversationId}`,
  CONVERSATION_TTL_SECONDS: 3600,
}));
vi.mock("../db.js", () => ({
  db: {
    toolInvocation: {
      create: vi.fn().mockResolvedValue({ id: "inv-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("../memory/conversationStore.js", () => ({
  createConversation: vi.fn().mockResolvedValue(undefined),
  appendMessage: vi.fn().mockResolvedValue("msg-1"),
}));
vi.mock("../memory/memoryStore.js", () => ({
  saveMemoryFact: vi.fn().mockResolvedValue(undefined),
  findRelevantMemories: vi.fn().mockResolvedValue([]),
}));
// Phase 1 slice 2's fire-and-forget task recording — mocked the same
// best-effort way as everything else here; createTask must resolve to a
// truthy id, or every recordTaskStep/completeTask call becomes a no-op by
// design (see session.ts), which would silently hide these assertions.
vi.mock("../tasks/taskStore.js", () => ({
  createTask: vi.fn().mockResolvedValue("task-1"),
  appendTaskStep: vi.fn().mockResolvedValue(undefined),
  completeTask: vi.fn().mockResolvedValue(undefined),
}));

// vi.hoisted: the mock fn must exist before vi.mock's factory runs, and the
// factory itself runs before any import below — this is the idiomatic vitest
// way to let test bodies control what a mocked class's method resolves to.
const automationRunMock = vi.hoisted(() => vi.fn());
vi.mock("../automation/runner.js", () => {
  class AutomationRunner {
    goal: string;
    constructor(_userId: string, _deviceId: string, goal: string, _apiKey: string, _send: unknown) {
      this.goal = goal;
    }
    run = automationRunMock;
    handleObservation = vi.fn();
    handleActionResult = vi.fn();
    handleCancel = vi.fn();
  }
  return { AutomationRunner };
});

const { transcribeAudio } = await import("../stt.js");
const { runLlmStep } = await import("../llm.js");
const { checkAndConsumeTurn } = await import("../rateLimit.js");
const { Session } = await import("./session.js");
const { getMessages } = await import("../i18n/messages.js");
const { createTask, appendTaskStep, completeTask } = await import("../tasks/taskStore.js");

const messages = getMessages("en");

// Session's constructor is private (only Session.create() may construct one),
// so the usual `InstanceType<typeof Session>` doesn't type-check here — derive
// the instance type from the public factory's return type instead.
type SessionInstance = Awaited<ReturnType<typeof Session.create>>;

type ToolCallMsg = Extract<ServerMessage, { type: "tool_call" }>;
type AssistantTextMsg = Extract<ServerMessage, { type: "assistant_text" }>;
type ErrorMsg = Extract<ServerMessage, { type: "error" }>;

function fakeWs() {
  const sent: ServerMessage[] = [];
  const ws = {
    readyState: 1,
    OPEN: 1,
    send: (raw: string) => sent.push(JSON.parse(raw)),
  };
  return { ws: ws as unknown as import("ws").WebSocket, sent };
}

let userCounter = 0;
// Each test gets its own userId — ws/userLock.ts is a real, module-level,
// in-memory Set shared across the whole test file; a distinct userId per
// test makes lock state fully isolated regardless of how any one test ends.
function nextUserId(): string {
  return `user-${userCounter++}`;
}

async function makeSession() {
  const { ws, sent } = fakeWs();
  const session = await Session.create(ws, nextUserId(), "device-1", [], "en");
  return { session, sent };
}

function llmToolCalls(calls: { id: string; name: string; args: unknown }[]) {
  return {
    assistantMessage: { role: "assistant" as const, content: "", tool_calls: [] },
    toolCalls: calls,
  };
}

function llmText(text: string) {
  return { assistantMessage: { role: "assistant" as const, content: text }, toolCalls: [] };
}

// Drives one full turn that resolves without ever needing a client-executed
// tool round-trip (no tool call, a gate/pause, or an already-mocked
// server-handled/automation outcome).
async function driveTurn(session: SessionInstance, transcript: string): Promise<void> {
  vi.mocked(transcribeAudio).mockResolvedValueOnce(transcript);
  await session.handleMessage({ type: "audio_chunk", data: Buffer.from("audio").toString("base64") });
  await session.handleMessage({ type: "audio_end" });
}

// Drives a turn that DOES dispatch a real client tool call (close_app,
// read_clipboard, etc. go through Session's private dispatchToolCall, which
// waits for a tool_result message before the turn can finish) — starts the
// turn, waits for the resulting tool_call, answers it, then lets the turn
// complete.
async function driveTurnWithToolDispatch(
  session: SessionInstance,
  transcript: string,
  sent: ServerMessage[],
  result: ToolResult
): Promise<ToolCallMsg> {
  vi.mocked(transcribeAudio).mockResolvedValueOnce(transcript);
  await session.handleMessage({ type: "audio_chunk", data: Buffer.from("audio").toString("base64") });
  const before = sent.length;
  const turnPromise = session.handleMessage({ type: "audio_end" });
  await vi.waitFor(() => {
    if (!sent.slice(before).some((m) => m.type === "tool_call")) throw new Error("tool_call not sent yet");
  });
  const call = sent.slice(before).find((m) => m.type === "tool_call") as ToolCallMsg;
  await session.handleMessage({ type: "tool_result", callId: call.callId, result });
  await turnPromise;
  return call;
}

function assistantTexts(msgs: ServerMessage[]): string[] {
  return msgs.filter((m): m is AssistantTextMsg => m.type === "assistant_text").map((m) => m.text);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkAndConsumeTurn).mockResolvedValue({ allowed: true, remaining: 24 } as never);
  automationRunMock.mockReset();
});

describe("state machine 1: generic confirmation gate", () => {
  it("gates a confirmation-required tool call and speaks the deterministic question, without a second LLM call", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "close_app", args: { app: "chrome" } }])
    );

    await driveTurn(session, "close chrome");

    expect(assistantTexts(sent)).toEqual(["Close chrome? Say yes to confirm."]);
    expect(vi.mocked(runLlmStep)).toHaveBeenCalledTimes(1);
    expect(sent.some((m) => m.type === "tool_call")).toBe(false);
  });

  it('resolves "Yes." (trailing punctuation) as yes, and mints a brand-new callId, never the gate turn\'s original', async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "close_app", args: { app: "chrome" } }])
    );
    await driveTurn(session, "close chrome");

    // continuation after the tool result resolves — model just acknowledges
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Done."));
    const call = await driveTurnWithToolDispatch(session, "Yes.", sent, { ok: true, message: "closed" });

    expect(call.name).toBe("close_app");
    expect(call.callId).not.toBe("orig-1");
    expect(assistantTexts(sent)).toContain("Done.");
  });

  it('resolves "no" as declined — the tool never dispatches, the utterance flows as a fresh request', async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "close_app", args: { app: "chrome" } }])
    );
    await driveTurn(session, "close chrome");

    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Okay, leaving it open."));
    await driveTurn(session, "no");

    expect(sent.some((m) => m.type === "tool_call")).toBe(false);
    expect(assistantTexts(sent)).toContain("Okay, leaving it open.");
  });

  it('treats an unclear reply ("maybe") the same as declined', async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "close_app", args: { app: "chrome" } }])
    );
    await driveTurn(session, "close chrome");

    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("No worries."));
    await driveTurn(session, "maybe");

    expect(sent.some((m) => m.type === "tool_call")).toBe(false);
  });

  it("only the first of two gated calls in one batch becomes resolvable; the second is dropped", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([
        { id: "orig-1", name: "close_app", args: { app: "chrome" } },
        { id: "orig-2", name: "read_clipboard", args: {} },
      ])
    );
    await driveTurn(session, "close chrome and check my clipboard");

    // Only close_app's question is ever spoken.
    expect(assistantTexts(sent)).toEqual(["Close chrome? Say yes to confirm."]);

    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Done."));
    const call = await driveTurnWithToolDispatch(session, "yes", sent, { ok: true, message: "closed" });

    // Resolving "yes" only ever dispatches close_app — read_clipboard is gone.
    expect(call.name).toBe("close_app");
    expect(sent.some((m) => m.type === "tool_call" && m.name === "read_clipboard")).toBe(false);
  });
});

describe("state machine 2: automation-start gate", () => {
  it("gates computer_use_task with its fixed confirmation text, same as any other gated tool", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "computer_use_task", args: { goal: "buy the thing" } }])
    );

    await driveTurn(session, "buy the thing on amazon");

    expect(assistantTexts(sent)).toEqual([
      "This lets me click and type on your screen to do that — it can sometimes click the wrong thing, and you can say stop at any point. Go ahead?",
    ]);
    expect(automationRunMock).not.toHaveBeenCalled();
  });

  it('on "yes" with a "done" outcome: constructs the runner, calls run("start"), and the main loop continues (LLM called again)', async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "computer_use_task", args: { goal: "buy the thing" } }])
    );
    await driveTurn(session, "buy the thing on amazon");

    automationRunMock.mockResolvedValueOnce({ kind: "done", summary: "Added it to the cart." });
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("All done, it's in your cart."));

    await driveTurn(session, "yes");

    expect(automationRunMock).toHaveBeenCalledWith("start");
    expect(vi.mocked(runLlmStep)).toHaveBeenCalledTimes(2); // gate decision + continuation
    expect(assistantTexts(sent)).toContain("All done, it's in your cart.");
  });

  it('on "yes" with a "needs_confirmation" outcome: speaks the specific risk prompt and ends the turn WITHOUT another LLM call', async () => {
    const { session, sent } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "computer_use_task", args: { goal: "buy the thing" } }])
    );
    await driveTurn(session, "buy the thing on amazon");

    automationRunMock.mockResolvedValueOnce({
      kind: "needs_confirmation",
      description: "Clicking the Place Order button",
    });
    const llmCallsBefore = vi.mocked(runLlmStep).mock.calls.length;

    await driveTurn(session, "yes");

    expect(assistantTexts(sent)).toContain(
      "Clicking the Place Order button — go ahead? Say yes to confirm."
    );
    expect(vi.mocked(runLlmStep).mock.calls.length).toBe(llmCallsBefore); // no continuation call this turn
  });

  it("never constructs the runner for an invalid/too-short goal", async () => {
    const { session } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "computer_use_task", args: { goal: "ab" } }])
    );
    await driveTurn(session, "do a thing");

    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Okay."));
    await driveTurn(session, "yes");

    expect(automationRunMock).not.toHaveBeenCalled();
  });
});

describe("state machine 3: automation-risk-step gate", () => {
  async function reachPendingRiskStep(session: SessionInstance, sent: ServerMessage[]) {
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "computer_use_task", args: { goal: "buy the thing" } }])
    );
    await driveTurn(session, "buy the thing on amazon");
    automationRunMock.mockResolvedValueOnce({ kind: "needs_confirmation", description: "Clicking Buy" });
    await driveTurn(session, "yes");
    expect(assistantTexts(sent)).toContain("Clicking Buy — go ahead? Say yes to confirm.");
  }

  it('resolves "yes" by calling run("resume-confirmed") and mints a fresh callId-bearing tool_calls/tool pair', async () => {
    const { session, sent } = await makeSession();
    await reachPendingRiskStep(session, sent);

    automationRunMock.mockResolvedValueOnce({ kind: "done", summary: "Order placed." });
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("All set, your order is placed."));

    await driveTurn(session, "yes");

    expect(automationRunMock).toHaveBeenLastCalledWith("resume-confirmed");
    expect(assistantTexts(sent)).toContain("All set, your order is placed.");
  });

  it('resolves "no" by calling run("resume-cancelled")', async () => {
    const { session, sent } = await makeSession();
    await reachPendingRiskStep(session, sent);

    automationRunMock.mockResolvedValueOnce({ kind: "done", summary: "Stopped — that step wasn't confirmed." });
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Okay, I stopped there."));

    await driveTurn(session, "no");

    expect(automationRunMock).toHaveBeenLastCalledWith("resume-cancelled");
  });

  it("chains into a second pause if the resumed step also needs confirmation", async () => {
    const { session, sent } = await makeSession();
    await reachPendingRiskStep(session, sent);

    automationRunMock.mockResolvedValueOnce({ kind: "needs_confirmation", description: "Confirming payment" });
    const llmCallsBefore = vi.mocked(runLlmStep).mock.calls.length;

    await driveTurn(session, "yes");

    expect(assistantTexts(sent)).toContain("Confirming payment — go ahead? Say yes to confirm.");
    expect(vi.mocked(runLlmStep).mock.calls.length).toBe(llmCallsBefore);

    // and it's still resolvable again after the second pause
    automationRunMock.mockResolvedValueOnce({ kind: "done", summary: "Paid." });
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Payment done."));
    await driveTurn(session, "yes");

    expect(automationRunMock).toHaveBeenLastCalledWith("resume-confirmed");
    expect(assistantTexts(sent)).toContain("Payment done.");
  });
});

describe("cross-cutting turn guards", () => {
  it("does nothing on an empty audio buffer", async () => {
    const { session, sent } = await makeSession();
    await session.handleMessage({ type: "audio_end" }); // no audio_chunk sent first

    expect(sent).toHaveLength(0);
    expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
  });

  it("stops before STT when the daily rate limit is exceeded", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(checkAndConsumeTurn).mockResolvedValueOnce({ allowed: false, remaining: 0 } as never);

    await session.handleMessage({ type: "audio_chunk", data: Buffer.from("audio").toString("base64") });
    await session.handleMessage({ type: "audio_end" });

    expect(sent).toEqual([{ type: "error", code: "rate_limited", message: messages.dailyLimitReached }]);
    expect(vi.mocked(transcribeAudio)).not.toHaveBeenCalled();
  });

  it("reports stt_failed when transcription throws", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error("could not process file"));

    await session.handleMessage({ type: "audio_chunk", data: Buffer.from("audio").toString("base64") });
    await session.handleMessage({ type: "audio_end" });

    const err = sent[0] as ErrorMsg;
    expect(err).toMatchObject({ type: "error", code: "stt_failed", message: messages.sttUnclearError });
  });

  it("reports stt_failed (empty) when transcription returns nothing", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(transcribeAudio).mockResolvedValueOnce("");

    await session.handleMessage({ type: "audio_chunk", data: Buffer.from("audio").toString("base64") });
    await session.handleMessage({ type: "audio_end" });

    expect(sent).toEqual([{ type: "error", code: "stt_failed", message: messages.sttEmptyError }]);
  });
});

// Phase 1 slice 2 (docs/IMPLEMENTATION_ROADMAP.md): "just start recording
// what already happens" — these assert the new Task/TaskStep recording is
// wired to the right outcome, WITHOUT re-testing the state machines above
// (already covered) and without ever letting a recording failure affect
// anything user-visible.
describe("Phase 1 slice 2: task recording (no behavior change)", () => {
  it("creates a task once a transcript exists, and marks it completed on a plain reply", async () => {
    const { session } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Hello!"));

    await driveTurn(session, "hi karvix");

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(completeTask).toHaveBeenCalledWith("task-1", "completed");
  });

  it("marks the task paused when a turn ends on a confirmation gate", async () => {
    const { session } = await makeSession();
    vi.mocked(runLlmStep).mockResolvedValueOnce(
      llmToolCalls([{ id: "orig-1", name: "close_app", args: { app: "chrome" } }])
    );

    await driveTurn(session, "close chrome");

    expect(appendTaskStep).toHaveBeenCalledWith("task-1", 0, expect.objectContaining({ kind: "confirmation_gate", toolName: "close_app" }));
    expect(completeTask).toHaveBeenCalledWith("task-1", "paused");
  });

  it("marks the task failed when the turn throws", async () => {
    const { session } = await makeSession();
    vi.mocked(runLlmStep).mockRejectedValueOnce(new Error("groq is down"));

    await driveTurn(session, "do something");

    expect(completeTask).toHaveBeenCalledWith("task-1", "failed");
  });

  it("never lets a task-recording failure affect the turn", async () => {
    const { session, sent } = await makeSession();
    vi.mocked(createTask).mockRejectedValueOnce(new Error("db unavailable"));
    vi.mocked(runLlmStep).mockResolvedValueOnce(llmText("Still works."));

    await driveTurn(session, "hi karvix");

    expect(assistantTexts(sent)).toEqual(["Still works."]);
  });
});
