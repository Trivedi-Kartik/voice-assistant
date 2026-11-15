import type { ChatMessage } from "../llm.js";
import type { ToolSchema } from "../tools/schemas.js";
import { AGENT_ACTION_SCHEMAS, toInternalAction } from "./actions.js";
import type { AgentAction } from "./types.js";
import type { Planner, PlannerDecision } from "./planner.js";

// Optional bring-your-own-model for the PC agent (decision 2026-11-14: Groq stays the default and Karvix NEVER
// switches models by itself; a user may pick another provider with their own key). A fixed allowlist of hosts — never a
// user-supplied URL — so the server can't be pointed at internal addresses (SSRF).

export const PROVIDERS = {
  openai: { label: "OpenAI", kind: "openai", base: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", kind: "anthropic", base: "https://api.anthropic.com/v1" },
  google: { label: "Google Gemini", kind: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai" },
  openrouter: { label: "OpenRouter", kind: "openai", base: "https://openrouter.ai/api/v1" },
  together: { label: "Together AI", kind: "openai", base: "https://api.together.xyz/v1" },
  mistral: { label: "Mistral", kind: "openai", base: "https://api.mistral.ai/v1" },
  deepseek: { label: "DeepSeek", kind: "openai", base: "https://api.deepseek.com/v1" },
} as const;

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]];
export const MODEL_NAME = /^[A-Za-z0-9._:/\-]{1,100}$/;

// A planner failure whose message is safe and useful to say to the user (never contains a key or a raw response).
export class PlannerError extends Error {
  constructor(readonly userMessage: string, detail?: string) {
    super(detail ?? userMessage);
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

function httpError(provider: string, status: number): PlannerError {
  if (status === 401 || status === 403) return new PlannerError(`${provider} rejected your API key. Check it in Settings.`);
  if (status === 404) return new PlannerError(`${provider} doesn't know that model name. Check it in Settings.`);
  if (status === 429) return new PlannerError(`${provider} says you've hit a rate or spending limit. Try again later.`);
  if (status === 402) return new PlannerError(`${provider} says your account needs credit.`);
  return new PlannerError(`${provider} had a problem (error ${status}). Try again.`, `status ${status}`);
}

function toDecision(call: { id: string; name: string; args: unknown } | undefined, text: string, base: ChatMessage): PlannerDecision {
  if (!call) return { kind: "text", assistant: { role: "assistant", content: text } };
  const raw = (call.args && typeof call.args === "object" ? call.args : {}) as Record<string, unknown>;
  const { name, args } = toInternalAction(call.name, raw);
  const action: AgentAction = { name, args };
  const assistant: ChatMessage = { ...base, content: text, tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(raw) } }] };
  return { kind: "action", action, assistant, toolCallId: call.id };
}

async function post(provider: string, url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new PlannerError(`I couldn't reach ${provider}. Check your connection and try again.`);
  }
  if (!res.ok) throw httpError(provider, res.status);
  return res.json();
}

// ---------------- OpenAI-compatible (OpenAI, Gemini, OpenRouter, Together, Mistral, DeepSeek) ----------------
export class OpenAiCompatiblePlanner implements Planner {
  constructor(
    private readonly provider: ProviderId,
    private readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly tools: ToolSchema[] = AGENT_ACTION_SCHEMAS
  ) {}

  async next(messages: ChatMessage[]): Promise<PlannerDecision> {
    const p = PROVIDERS[this.provider];
    const json = (await post(p.label, `${p.base}/chat/completions`, { Authorization: `Bearer ${this.apiKey}` }, { model: this.model, messages, tools: this.tools, tool_choice: "auto" }, this.fetchImpl)) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new PlannerError(`${p.label} sent an answer I couldn't read.`);
    const tc = msg.tool_calls?.[0];
    let args: unknown = {};
    if (tc) {
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* malformed arguments -> empty args; the runner/skill reports what's missing */
      }
    }
    return toDecision(tc ? { id: tc.id, name: tc.function.name, args } : undefined, (msg.content ?? "").trim(), { role: "assistant", content: "" });
  }
}

// ---------------- Anthropic Messages API ----------------
type AnthropicBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: "tool_result"; tool_use_id: string; content: string };
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

// Our history is OpenAI-shaped (system / user / assistant+tool_calls / tool). Anthropic wants the system prompt separate,
// tool results as user-role tool_result blocks, and strictly alternating roles — adjacent same-role messages are merged.
export function toAnthropic(messages: ChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const out: AnthropicMessage[] = [];
  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role) (last.content as AnthropicBlock[]).push(...blocks);
    else out.push({ role, content: [...blocks] });
  };
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") push("user", [{ type: "text", text: m.content || "(continue)" }]);
    else if (m.role === "tool") push("user", [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content }]);
    else {
      const blocks: AnthropicBlock[] = [];
      if (m.content?.trim()) blocks.push({ type: "text", text: m.content });
      for (const c of m.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(c.function.arguments || "{}");
        } catch {
          /* keep {} */
        }
        blocks.push({ type: "tool_use", id: c.id, name: c.function.name, input });
      }
      if (blocks.length) push("assistant", blocks);
    }
  }
  return { system, messages: out };
}

export class AnthropicPlanner implements Planner {
  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly tools: ToolSchema[] = AGENT_ACTION_SCHEMAS
  ) {}

  async next(messages: ChatMessage[]): Promise<PlannerDecision> {
    const p = PROVIDERS.anthropic;
    const { system, messages: msgs } = toAnthropic(messages);
    const json = (await post(
      p.label,
      `${p.base}/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: 1024,
        system,
        messages: msgs,
        tools: this.tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })),
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
      },
      this.fetchImpl
    )) as { content?: ({ type: string; text?: string; id?: string; name?: string; input?: unknown })[] };
    if (!Array.isArray(json.content)) throw new PlannerError(`${p.label} sent an answer I couldn't read.`);
    const text = json.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    const tu = json.content.find((b) => b.type === "tool_use");
    return toDecision(tu ? { id: tu.id ?? "tool", name: tu.name ?? "", args: tu.input } : undefined, text, { role: "assistant", content: "" });
  }
}

export function buildProviderPlanner(provider: ProviderId, model: string, apiKey: string, fetchImpl?: typeof fetch): Planner {
  return PROVIDERS[provider].kind === "anthropic" ? new AnthropicPlanner(model, apiKey, fetchImpl) : new OpenAiCompatiblePlanner(provider, model, apiKey, fetchImpl);
}
