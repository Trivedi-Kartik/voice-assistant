import { describe, expect, it, vi } from "vitest";
import { AgentRunner, AGENT_LIMITS } from "./runner.js";
import { classifyAction } from "./safety.js";
import { toInternalAction, AGENT_ACTION_NAMES } from "./actions.js";
import type { Planner, PlannerDecision } from "./planner.js";
import type { ChatMessage } from "../llm.js";
import type { ActionResult, AgentAction, AgentDevice, AgentStatus } from "./types.js";

let callSeq = 0;
const act = (name: string, args: Record<string, unknown> = {}, expectation?: AgentAction["expect"]): PlannerDecision => {
  const id = `c${++callSeq}`;
  return {
    kind: "action",
    action: { name, args, expect: expectation },
    toolCallId: id,
    assistant: { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  };
};
const text = (content: string): PlannerDecision => ({ kind: "text", assistant: { role: "assistant", content } });

function scripted(decisions: PlannerDecision[]) {
  const seen: ChatMessage[][] = [];
  const planner: Planner = {
    next: vi.fn(async (messages: ChatMessage[]) => {
      seen.push(messages.map((m) => ({ ...m })));
      const d = decisions.shift();
      if (!d) throw new Error("planner script exhausted");
      return d;
    }),
  };
  return { planner, seen };
}

function device(results: Partial<Record<string, (a: AgentAction) => ActionResult>> = {}, verifyOk = true) {
  const calls: AgentAction[] = [];
  const dev: AgentDevice = {
    observe: vi.fn(async () => ({ platform: "linux", activeWindow: { title: "Desktop" } })),
    act: vi.fn(async (a: AgentAction) => {
      calls.push(a);
      return results[a.name]?.(a) ?? { ok: true, message: `${a.name} ok` };
    }),
    verify: vi.fn(async () => ({ ok: verifyOk, detail: verifyOk ? "ok" : "file does not contain 'milk'" })),
  };
  return { dev, calls };
}

function runner(planner: Planner, dev: AgentDevice, extra: Partial<ConstructorParameters<typeof AgentRunner>[0]> = {}) {
  const statuses: AgentStatus[] = [];
  const r = new AgentRunner({ goal: "add milk to my list", language: "en", device: dev, planner, onStatus: (s) => statuses.push(s), ...extra });
  return { r, statuses };
}

// Every assistant tool_call must be answered by a tool message before the next assistant/user message.
function assertHistoryValid(messages: ChatMessage[]) {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    for (const call of m.tool_calls ?? []) {
      expect(messages[i + 1]?.role).toBe("tool");
      expect(messages[i + 1]?.tool_call_id).toBe(call.id);
    }
    if (m.role === "tool") expect(messages[i - 1]?.tool_calls?.[0]?.id).toBe(m.tool_call_id);
  }
}

describe("AgentRunner", () => {
  it("runs skills until done and reports progress", async () => {
    const { planner, seen } = scripted([act("file_write", { path: "~/list.txt", content: "milk", mode: "append" }), act("done", { summary: "Added milk." })]);
    const { dev, calls } = device();
    const { r, statuses } = runner(planner, dev);
    await expect(r.start()).resolves.toEqual({ kind: "done", summary: "Added milk." });
    expect(calls.map((c) => c.name)).toEqual(["file_write"]);
    expect(statuses[0]).toEqual({ state: "started", goal: "add milk to my list" });
    expect(statuses.at(-1)).toMatchObject({ state: "ended", ok: true });
    expect(seen[0][1].content).toContain("Goal: add milk to my list");
    assertHistoryValid(seen[1]);
  });

  it("pauses to ask the user and resumes with the answer", async () => {
    const { planner, seen } = scripted([act("ask_user", { question: "Which list?" }), act("done", { summary: "Done." })]);
    const { dev } = device();
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toEqual({ kind: "ask", question: "Which list?" });
    expect(r.waiting).toBe("ask");
    await expect(r.resumeWithAnswer("the shopping one")).resolves.toMatchObject({ kind: "done" });
    const last = seen[1];
    assertHistoryValid(last);
    expect(last.at(-1)?.content).toContain("the shopping one");
  });

  it("requires a spoken yes before deleting, and runs it only after yes", async () => {
    const { planner } = scripted([act("file_delete", { path: "~/old.txt" }), act("done", { summary: "Deleted." })]);
    const { dev, calls } = device();
    const { r } = runner(planner, dev);
    const first = await r.start();
    expect(first).toMatchObject({ kind: "confirm" });
    expect((first as { prompt: string }).prompt).toContain("~/old.txt");
    expect(calls).toHaveLength(0);
    await expect(r.resumeWithConfirmation(true)).resolves.toMatchObject({ kind: "done" });
    expect(calls).toEqual([expect.objectContaining({ name: "file_delete", confirmed: true })]);
  });

  it("never runs the risky action when the user says no", async () => {
    const { planner, seen } = scripted([act("file_delete", { path: "~/old.txt" }), act("done", { summary: "Okay, left it." })]);
    const { dev, calls } = device();
    const { r } = runner(planner, dev);
    await r.start();
    await expect(r.resumeWithConfirmation(false)).resolves.toMatchObject({ kind: "done" });
    expect(calls).toHaveLength(0);
    expect(seen[1].at(-1)?.content).toMatch(/said no/i);
    assertHistoryValid(seen[1]);
  });

  it("honours the client's own confirmation demand (e.g. overwriting an existing file)", async () => {
    const { planner } = scripted([act("file_write", { path: "~/a.txt", content: "x", mode: "overwrite" }), act("done", { summary: "Replaced." })]);
    const { dev, calls } = device({
      file_write: (a) => (a.confirmed ? { ok: true, message: "written" } : { ok: false, message: "exists", needsConfirmation: { prompt: "Replace ~/a.txt?" } }),
    });
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toEqual({ kind: "confirm", prompt: "Replace ~/a.txt?" });
    await expect(r.resumeWithConfirmation(true)).resolves.toMatchObject({ kind: "done" });
    expect(calls.map((c) => c.confirmed ?? false)).toEqual([false, true]);
  });

  it("refuses to type into password fields and tells the planner why", async () => {
    const { planner, seen } = scripted([act("set_text", { element: "Password", text: "hunter2" }), act("ask_user", { question: "Please type your password, then say continue." })]);
    const { dev, calls } = device();
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toMatchObject({ kind: "ask" });
    expect(calls).toHaveLength(0);
    expect(seen[1].at(-1)?.content).toContain("won't type passwords");
  });

  it("turns a failed verification into a failure the planner sees", async () => {
    const { planner, seen } = scripted([act("file_write", { path: "~/l.txt", content: "eggs", mode: "append" }, { fileContains: { path: "~/l.txt", text: "milk" } }), act("done", { summary: "x" })]);
    const { dev } = device({}, false);
    const { r } = runner(planner, dev);
    await r.start();
    const tool = JSON.parse(seen[1].at(-1)!.content);
    expect(tool.ok).toBe(false);
    expect(tool.message).toContain("check failed");
  });

  it("stops after repeated failures instead of looping", async () => {
    const decisions = Array.from({ length: 10 }, () => act("open_app", { app: "nope" }));
    const { planner } = scripted(decisions);
    const { dev, calls } = device({ open_app: () => ({ ok: false, message: "not installed" }) });
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toMatchObject({ kind: "failed" });
    expect(calls).toHaveLength(AGENT_LIMITS.maxConsecutiveFailures);
  });

  it("enforces the step budget", async () => {
    const { planner } = scripted(Array.from({ length: 10 }, () => act("observe")));
    const { dev } = device();
    const { r } = runner(planner, dev, { limits: { maxSteps: 3 } });
    await expect(r.start()).resolves.toMatchObject({ kind: "failed" });
    expect(planner.next).toHaveBeenCalledTimes(3);
  });

  it("enforces the time budget", async () => {
    let t = 0;
    const { planner } = scripted(Array.from({ length: 10 }, () => act("wait", { seconds: 1 })));
    const { dev } = device({ wait: () => ((t += 60_000), { ok: true, message: "waited" }) });
    const { r } = runner(planner, dev, { now: () => t, limits: { timeoutMs: 120_000 } });
    await expect(r.start()).resolves.toMatchObject({ kind: "failed", reason: expect.stringContaining("too long") });
  });

  it("can be cancelled mid-task", async () => {
    const { planner } = scripted([act("wait", { seconds: 1 }), act("done", { summary: "x" })]);
    const { dev } = device();
    const { r } = runner(planner, dev);
    (dev.act as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      r.cancel();
      return { ok: true, message: "ok" };
    });
    await expect(r.start()).resolves.toEqual({ kind: "cancelled" });
  });

  it("nudges once when the model replies in prose, then accepts it", async () => {
    const { planner } = scripted([text("I think it's done"), text("All done.")]);
    const { dev } = device();
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toEqual({ kind: "done", summary: "All done." });
  });

  it("keeps the planner context bounded without orphaning tool results", async () => {
    const decisions = [...Array.from({ length: 30 }, () => act("observe")), act("done", { summary: "ok" })];
    const { planner, seen } = scripted(decisions);
    const { dev } = device();
    const { r } = runner(planner, dev, { limits: { keepRecentSteps: 5 } });
    await r.start();
    const last = seen.at(-1)!;
    expect(last.length).toBeLessThanOrEqual(2 + 5 * 2);
    expect(last[0].role).toBe("system");
    expect(last[1].content).toContain("Goal:");
    assertHistoryValid(last);
  });
});

describe("classifyAction (deterministic safety gate)", () => {
  const a = (name: string, args: Record<string, unknown>, confirmed = false): AgentAction => ({ name, args, confirmed });
  it("requires confirmation for deletes and consequential clicks", () => {
    expect(classifyAction(a("file_delete", { path: "~/x" })).level).toBe("confirm");
    for (const label of ["Place order", "Buy now", "Send", "Delete", "Checkout", "Submit"]) {
      expect(classifyAction(a("click", { element: label })).level).toBe("confirm");
    }
    expect(classifyAction(a("click", { element: "File" })).level).toBe("allow");
    expect(classifyAction(a("click", { element: "12" }), "Send message").level).toBe("confirm");
  });
  it("blocks typing secrets", () => {
    expect(classifyAction(a("set_text", { element: "Card number", text: "4111" })).level).toBe("block");
    expect(classifyAction(a("type_text", { text: "x" }), "Password").level).toBe("block");
  });
  it("lets confirmed actions through", () => {
    expect(classifyAction(a("file_delete", { path: "~/x" }, true)).level).toBe("allow");
  });
});

describe("toInternalAction (compact planner schema -> internal actions)", () => {
  it("maps file/clipboard ops to the internal names the desktop understands", () => {
    expect(toInternalAction("file", { op: "write", path: "~/a", content: "x", mode: "append" })).toEqual({ name: "file_write", args: { path: "~/a", content: "x", mode: "append" } });
    expect(toInternalAction("clipboard", { op: "read" })).toEqual({ name: "clipboard_read", args: {} });
    expect(toInternalAction("open_app", { app: "notepad" })).toEqual({ name: "open_app", args: { app: "notepad" } });
  });
  it("turns path into from for move/copy (regression: 'No path given' in the eval)", () => {
    expect(toInternalAction("file", { op: "move", path: "~/Desktop/a.txt", to: "~/Desktop/b.txt" })).toEqual({ name: "file_move", args: { from: "~/Desktop/a.txt", to: "~/Desktop/b.txt" } });
    expect(toInternalAction("file", { op: "copy", path: "~/x", to: "~/y" }).args).toEqual({ from: "~/x", to: "~/y" });
  });
  it("only ever produces names the runner knows", () => {
    for (const op of ["read", "write", "list", "move", "copy", "delete", "open"]) expect(AGENT_ACTION_NAMES.has(toInternalAction("file", { op, path: "~" }).name)).toBe(true);
    expect(AGENT_ACTION_NAMES.has(toInternalAction("file", { op: "explode", path: "~" }).name)).toBe(false);
  });
});

describe("recoverRejectedGeneration (Groq rejected the model's output)", () => {
  it("treats a fake tool call carrying a summary as done", async () => {
    const { recoverRejectedGeneration } = await import("./planner.js");
    const d = recoverRejectedGeneration('{"name": "answer", "arguments": {"summary": "Renamed notes.txt."}}');
    expect(d.kind).toBe("action");
    if (d.kind === "action") {
      expect(d.action).toEqual({ name: "done", args: { summary: "Renamed notes.txt." } });
      expect(d.assistant.tool_calls?.[0].id).toBe(d.toolCallId); // history stays valid
    }
  });
  it("treats plain prose as text (runner nudges once, then accepts it as the summary)", async () => {
    const { recoverRejectedGeneration } = await import("./planner.js");
    expect(recoverRejectedGeneration("  Todo list updated with “call the plumber”. ")).toEqual({
      kind: "text",
      assistant: { role: "assistant", content: "Todo list updated with “call the plumber”." },
    });
  });
  it("end to end: prose after the last step ends the task as done, not as a crash", async () => {
    const { planner } = scripted([act("file_write", { path: "~/l.txt", content: "x", mode: "append" }), text("Todo list updated."), text("Todo list updated.")]);
    const { dev } = device();
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toEqual({ kind: "done", summary: "Todo list updated." });
  });
});
