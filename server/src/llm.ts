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

// llama-3.3-70b-versatile was decommissioned by Groq on 2026-08-16
// (console.groq.com/docs/deprecations). Of Groq's two recommended
// replacements, openai/gpt-oss-120b is the production model with confirmed
// tool/function-calling support; qwen/qwen3.6-27b is explicitly marked
// "preview — for evaluation purposes only" by Groq, with tool-calling
// support undocumented — too risky to build this app's entire tool-dispatch
// loop on. See docs/ARCHITECTURE.md "Known reliability limitation" — the
// tool_use_failed retry logic below was tuned against Llama 3.3's specific
// failure rate and needs re-verification against real usage on this model,
// not assumed to carry over unchanged.
const MODEL = "openai/gpt-oss-120b";

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
      // warn, not error: this is the expected/handled path (see comment above and
      // docs/ARCHITECTURE.md) — most of these retries succeed and the user never
      // sees a failure, so logging the full error at `error` severity here made a
      // routine, self-healing retry look like a crash. The real failure, if
      // retries are exhausted, is already logged with the full error by the
      // caller (ws/session.ts "[session] turn failed").
      console.warn(
        `[llm] retrying (attempt ${attempt}/${MAX_GENERATION_RETRIES}, reason=${rateLimited ? "rate_limited" : "tool_use_failed"})`
      );
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
    const parsed = JSON.parse(raw);
    // Zero-arg tools (read_clipboard, take_screenshot_and_describe) expect
    // {} — but the model sometimes emits literal "null" for "no arguments",
    // which JSON.parse accepts without throwing, so the catch below never
    // fires. Confirmed via real testing: this reached the client as a
    // literal `null` and failed zod's z.object({}).parse(null) downstream.
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
