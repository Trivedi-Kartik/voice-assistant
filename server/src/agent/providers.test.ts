import { describe, expect, it, vi } from "vitest";
import { AnthropicPlanner, OpenAiCompatiblePlanner, PlannerError, PROVIDERS, PROVIDER_IDS, MODEL_NAME, toAnthropic, buildProviderPlanner } from "./providers.js";
import { AgentRunner } from "./runner.js";
import type { ChatMessage } from "../llm.js";
import type { AgentDevice } from "./types.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const history: ChatMessage[] = [
  { role: "system", content: "You are the agent." },
  { role: "user", content: "Goal: make a file" },
  { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "file", arguments: '{"op":"list","path":"~"}' } }] },
  { role: "tool", tool_call_id: "c1", content: '{"ok":true,"message":"3 items"}' },
];

describe("provider allowlist", () => {
  it("only ever talks to fixed https hosts (no user-supplied URL, so no SSRF)", () => {
    for (const id of PROVIDER_IDS) expect(PROVIDERS[id].base).toMatch(/^https:\/\/[a-z0-9.-]+\//);
    expect(PROVIDER_IDS).not.toContain("custom");
  });
  it("model names can't smuggle anything into a request", () => {
    expect(MODEL_NAME.test("gpt-4.1-mini")).toBe(true);
    expect(MODEL_NAME.test("anthropic/claude-sonnet-4.5")).toBe(true);
    expect(MODEL_NAME.test("x; rm -rf /")).toBe(false);
    expect(MODEL_NAME.test("a".repeat(101))).toBe(false);
    expect(MODEL_NAME.test("")).toBe(false);
  });
});

describe("OpenAiCompatiblePlanner", () => {
  it("sends the key as a bearer token and maps a tool call to an internal action", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => json({ choices: [{ message: { content: null, tool_calls: [{ id: "t9", function: { name: "file", arguments: '{"op":"write","path":"~/a.txt","content":"hi","mode":"create"}' } }] } }] }));
    const d = await new OpenAiCompatiblePlanner("openai", "gpt-4.1-mini", "sk-test-123456", f as never).next(history);
    expect(f.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect((f.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer sk-test-123456");
    expect(JSON.parse(String(f.mock.calls[0][1].body)).model).toBe("gpt-4.1-mini");
    expect(d.kind).toBe("action");
    if (d.kind === "action") {
      expect(d.action).toEqual({ name: "file_write", args: { path: "~/a.txt", content: "hi", mode: "create" } });
      expect(d.assistant.tool_calls?.[0].id).toBe("t9");
    }
  });
  it("turns plain text into a text decision", async () => {
    const f = vi.fn(async () => json({ choices: [{ message: { content: "All done." } }] }));
    expect(await new OpenAiCompatiblePlanner("openrouter", "m", "k-1234567890", f as never).next(history)).toMatchObject({ kind: "text", assistant: { content: "All done." } });
  });
  it("gives the user an actionable message for each kind of provider failure — and never leaks the key", async () => {
    const cases: [number, RegExp][] = [[401, /rejected your API key/], [404, /model name/], [429, /rate or spending limit/], [402, /credit/], [500, /problem \(error 500\)/]];
    for (const [status, re] of cases) {
      const f = vi.fn(async () => json({ error: { message: "secret-sk-test leaked?" } }, status));
      const err = await new OpenAiCompatiblePlanner("openai", "m", "sk-test-secret", f as never).next(history).catch((e) => e);
      expect(err).toBeInstanceOf(PlannerError);
      expect(err.userMessage).toMatch(re);
      expect(err.userMessage).not.toContain("sk-test");
    }
    const down = await new OpenAiCompatiblePlanner("openai", "m", "k-1234567890", vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as never).next(history).catch((e) => e);
    expect(down.userMessage).toMatch(/couldn't reach OpenAI/);
  });
});

describe("Anthropic adapter", () => {
  it("converts OpenAI-shaped history: system split out, tool results as user tool_result blocks, roles alternate", () => {
    const { system, messages } = toAnthropic([...history, { role: "assistant", content: "", tool_calls: [{ id: "c2", type: "function", function: { name: "done", arguments: '{"summary":"ok"}' } }] }, { role: "tool", tool_call_id: "c2", content: "{}" }, { role: "user", content: "Reply by calling one function" }]);
    expect(system).toBe("You are the agent.");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect((messages[1].content as { type: string; name?: string; input?: unknown }[])[0]).toMatchObject({ type: "tool_use", id: "c1", name: "file", input: { op: "list", path: "~" } });
    // the tool result and the following nudge are merged into ONE user turn (Anthropic requires alternation)
    const last = messages[4].content as { type: string }[];
    expect(last.map((b) => b.type)).toEqual(["tool_result", "text"]);
  });
  it("sends x-api-key + version header and maps tool_use back to an internal action", async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => json({ content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "tu_1", name: "system", input: { setting: "volume", value: "up" } }] }));
    const d = await new AnthropicPlanner("claude-sonnet-4-5", "sk-ant-test-12345", f as never).next(history);
    const init = f.mock.calls[0][1];
    expect(f.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-test-12345", "anthropic-version": "2023-06-01" });
    const body = JSON.parse(String(init.body));
    expect(body.tools[0]).toHaveProperty("input_schema");
    expect(body.tool_choice).toMatchObject({ type: "auto" });
    expect(d.kind === "action" && d.action).toEqual({ name: "system_setting", args: { setting: "volume", value: "up" } });
  });
  it("buildProviderPlanner picks the right adapter", () => {
    expect(buildProviderPlanner("anthropic", "m", "k-1234567890")).toBeInstanceOf(AnthropicPlanner);
    expect(buildProviderPlanner("openai", "m", "k-1234567890")).toBeInstanceOf(OpenAiCompatiblePlanner);
    expect(buildProviderPlanner("google", "m", "k-1234567890")).toBeInstanceOf(OpenAiCompatiblePlanner);
  });
});

describe("runner speaks provider problems plainly (no silent fallback to another model)", () => {
  it("a rejected key ends the task with that message", async () => {
    const planner = new OpenAiCompatiblePlanner("openai", "m", "bad-key-1234567", vi.fn(async () => json({}, 401)) as never);
    const device: AgentDevice = { observe: async () => ({}), act: vi.fn(), verify: vi.fn() } as never;
    const out = await new AgentRunner({ goal: "x", language: "en", device, planner }).start();
    expect(out).toEqual({ kind: "failed", reason: "OpenAI rejected your API key. Check it in Settings." });
    expect(device.act).not.toHaveBeenCalled();
  });
});
