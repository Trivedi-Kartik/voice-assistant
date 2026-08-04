import Groq from "groq-sdk";
import type { ToolSchema } from "./tools/schemas.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export interface RequestedToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface LlmStepResult {
  assistantMessage: ChatMessage;
  toolCalls: RequestedToolCall[];
}

const MODEL = "llama-3.3-70b-versatile";

// Confirmed via real testing (not hypothetical): Llama 3.3 on Groq occasionally
// generates a malformed tool call — literally `<function=open_app{...}</function>`
// pseudo-XML instead of a proper structured call — and Groq's API rejects the
// whole completion with a 400 `tool_use_failed` before it ever reaches us. This
// is generation-quality noise, not a deterministic bug: the exact same messages
// succeed on a retry most of the time. Without retrying, this surfaced to users
// as an intermittent "something went wrong" on completely valid requests.
const MAX_GENERATION_RETRIES = 4;

// Exported so ws/session.ts can give a specific, actionable error message on the
// rare case retries don't resolve it, instead of a generic failure — this is a
// well-understood, expected occasional failure mode, not a mystery bug.
export function isRetryableToolUseFailure(err: unknown): boolean {
  if (!(err instanceof Groq.APIError) || err.status !== 400) return false;
  const body = err.error as { error?: { code?: string } } | undefined;
  return body?.error?.code === "tool_use_failed";
}

// One step of the tool-calling loop: send history + tool schemas, get back either
// plain text (done) or one/more tool_calls. The caller (ws/session.ts) is
// responsible for running the loop — sending tool_call to the client, awaiting
// tool_result, appending it, and calling this again — since that round-trip has to
// cross the WebSocket to the device that actually executes tools.
export async function runLlmStep(
  apiKey: string,
  messages: ChatMessage[],
  tools: ToolSchema[]
): Promise<LlmStepResult> {
  const groq = new Groq({ apiKey });

  let completion;
  for (let attempt = 1; ; attempt++) {
    try {
      completion = await groq.chat.completions.create({
        model: MODEL,
        messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
      });
      break;
    } catch (err) {
      if (attempt >= MAX_GENERATION_RETRIES || !isRetryableToolUseFailure(err)) throw err;
      console.error(`[llm] retrying after malformed tool-call generation (attempt ${attempt})`, err);
    }
  }

  const choice = completion.choices[0];
  if (!choice?.message) {
    throw new Error("Groq returned no completion choice");
  }

  const rawToolCalls = choice.message.tool_calls ?? [];
  const toolCalls: RequestedToolCall[] = rawToolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: safeParseArgs(tc.function.arguments),
  }));

  return {
    assistantMessage: {
      role: "assistant",
      content: choice.message.content ?? "",
      tool_calls: rawToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: tc.function,
      })),
    },
    toolCalls,
  };
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
