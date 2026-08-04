import Groq from "groq-sdk";
import type { GROQ_TOOL_SCHEMAS } from "./tools/schemas.js";

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

// One step of the tool-calling loop: send history + tool schemas, get back either
// plain text (done) or one/more tool_calls. The caller (ws/session.ts) is
// responsible for running the loop — sending tool_call to the client, awaiting
// tool_result, appending it, and calling this again — since that round-trip has to
// cross the WebSocket to the device that actually executes tools.
export async function runLlmStep(
  apiKey: string,
  messages: ChatMessage[],
  tools: typeof GROQ_TOOL_SCHEMAS
): Promise<LlmStepResult> {
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? "auto" : undefined,
  });

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
