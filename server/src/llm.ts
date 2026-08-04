import Groq from "groq-sdk";
import type { ToolSchema } from "./tools/schemas.js";
import { isGroqRateLimit, isRetryableToolUseFailure, getRetryAfterSeconds, sleep } from "./groqErrors.js";

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

// Without retrying, both failure modes below surfaced to users as an
// intermittent "something went wrong" on completely valid requests — see
// groqErrors.ts for why each is retryable and docs/ARCHITECTURE.md "Known
// reliability limitation" for the full story on tool_use_failed specifically.
const MAX_GENERATION_RETRIES = 6;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;
// If Groq says to wait longer than this, it's a quota reset (e.g. daily token
// limit), not a momentary burst — retrying every 1.5s is pointless and just
// burns the remaining retry budget for nothing. Fail fast instead so the user
// gets an accurate wait time (see ws/session.ts) rather than a delayed generic
// failure. Confirmed via real testing: a ~10min daily-quota reset produced 6
// useless retries before this fix.
const MAX_SHORT_RATE_LIMIT_WAIT_SECONDS = 5;

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
      const rateLimited = isGroqRateLimit(err);
      const retryAfter = rateLimited ? getRetryAfterSeconds(err) : null;
      const isLongWait = retryAfter !== null && retryAfter > MAX_SHORT_RATE_LIMIT_WAIT_SECONDS;

      if (isLongWait || attempt >= MAX_GENERATION_RETRIES || !(rateLimited || isRetryableToolUseFailure(err))) {
        throw err;
      }
      console.error(`[llm] retrying (attempt ${attempt}, rateLimited=${rateLimited})`, err);
      if (rateLimited) await sleep(RATE_LIMIT_RETRY_DELAY_MS);
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
