import type { ServerMessage, ToolResult } from "./protocol.js";
import { runLlmStep, type ChatMessage } from "./llm.js";
import {
  toolSchemasForCapabilities,
  SERVER_TOOL_SCHEMAS,
  SERVER_TOOL_NAMES,
  AUTOMATION_TOOL_SCHEMAS,
  CONFIRMATION_PROMPTS,
} from "./tools/schemas.js";
import { TOOL_NAMES } from "./tools/toolNames.js";
import { getMessages } from "./i18n/messages.js";
import { getConfirmationPrompt } from "./i18n/confirmationPrompts.js";
import { appendMessage } from "./memory/conversationStore.js";
import type { TaskStepKind } from "./tasks/taskStore.js";

// Extracted from ws/session.ts (Phase 1 slice 3 — see docs/IMPLEMENTATION_ROADMAP.md
// and docs/TARGET_ARCHITECTURE.md §3). This is "the tool-calling loop" specifically —
// deciding and executing each step of one turn, given an already-resolved API key and
// history. Deliberately does NOT know about computer-use automation's own
// start/resume (those are only ever invoked from the pre-loop confirmation-resolution
// blocks that stay in Session, not from inside this loop) or about WS connection
// lifecycle at all — every side effect happens through `deps`, which is what makes
// this "callable independent of a live WS connection."

// Explicit about never verbalizing tool/function mechanics: without this, models
// occasionally narrate their own tool usage in plain-text form (e.g. literally
// writing "web_search(query: ...)" as if it were prose) instead of using the
// structured tool-calling mechanism — that text then gets spoken/shown to the
// user verbatim. sanitizeAssistantText() below is the defensive backstop for
// when a model does this anyway.
const TOOL_NAME_ALTERNATION = TOOL_NAMES.join("|");
const BARE_CALL_PATTERN = new RegExp(`\\b(${TOOL_NAME_ALTERNATION})\\s*\\([^)]*\\)`, "gi");
const FUNCTION_TAG_PATTERN = /<\/?function\b[^>]*>/gi;
// Non-global twin of the two patterns above, used only for detection (see
// looksLikeLeakedToolCall below) — deliberately a separate regex object, not
// .test() on the global ones: a global regex's .test() mutates its own
// lastIndex, so reusing BARE_CALL_PATTERN/FUNCTION_TAG_PATTERN here would give
// wrong answers on alternating calls depending on prior state.
const LEAK_DETECT_PATTERN = new RegExp(`(<\\/?function\\b[^>]*>)|(\\b(${TOOL_NAME_ALTERNATION})\\s*\\([^)]*\\))`, "i");

// Distinct from the documented tool_use_failed retry in llm.ts (a 400 the SDK
// throws): here Groq returns 200 with toolCalls empty because the model chose
// to write the call as prose instead of using the real mechanism. Confirmed
// live: "search for X" produced exactly this — no tool ever ran. Retry a
// couple of times before falling back to sanitizeAssistantText's honest
// failure message, same self-healing spirit as the other retry.
const MAX_LEAKED_CALL_RETRIES = 2;
const MAX_TOOL_LOOP_STEPS = 6; // bounded — a misbehaving model can't hang a session forever

function looksLikeLeakedToolCall(text: string): boolean {
  return LEAK_DETECT_PATTERN.test(text);
}

function sanitizeAssistantText(text: string, language: string): string {
  let cleaned = text.replace(/```[\s\S]*?```/g, "").trim();
  cleaned = cleaned.replace(FUNCTION_TAG_PATTERN, "").trim();
  cleaned = cleaned.replace(BARE_CALL_PATTERN, "").trim();
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  const messages = getMessages(language);
  // A leak was actually caught and stripped — say so honestly rather than
  // falsely implying success with a generic "Done."
  if (cleaned.length === 0 && text.trim().length > 0) {
    return messages.leakedCallFallback;
  }
  return cleaned.length > 0 ? cleaned : messages.doneFallback;
}

export interface ToolLoopDeps {
  apiKey: string;
  language: string;
  capabilities: string[];
  conversationId: string;
  history: ChatMessage[]; // mutated in place — the same array Session holds
  userMessageId?: string;
  dispatchToolCall(callId: string, name: string, args: unknown): Promise<ToolResult>;
  handleServerTool(name: string, args: unknown, sourceMessageId?: string): Promise<ToolResult>;
  speakAndEndTurn(text: string): Promise<void>;
  recordTaskStep(kind: TaskStepKind, toolName?: string, result?: ToolResult): void;
  send(msg: ServerMessage): void;
}

export interface ToolLoopResult {
  outcome: "completed" | "paused";
  // Only set when outcome is "paused" via the generic confirmation gate — the
  // caller (Session) is responsible for storing this as its own cross-turn
  // pendingConfirmation state; this function has no notion of "next turn."
  pendingConfirmation?: { name: string; args: unknown };
}

export async function runToolLoop(deps: ToolLoopDeps): Promise<ToolLoopResult> {
  const messages = getMessages(deps.language);
  const tools = [...toolSchemasForCapabilities(deps.capabilities), ...SERVER_TOOL_SCHEMAS, ...AUTOMATION_TOOL_SCHEMAS];
  let pendingConfirmation: { name: string; args: unknown } | undefined;

  for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step++) {
    let assistantMessage, toolCalls;
    for (let leakAttempt = 0; ; leakAttempt++) {
      ({ assistantMessage, toolCalls } = await runLlmStep(deps.apiKey, deps.history, tools));
      const leaked = toolCalls.length === 0 && looksLikeLeakedToolCall(assistantMessage.content);
      if (!leaked || leakAttempt >= MAX_LEAKED_CALL_RETRIES) break;
      console.warn(`[llm] retrying leaked tool-call-as-text (attempt ${leakAttempt + 1}/${MAX_LEAKED_CALL_RETRIES})`);
    }
    deps.history.push(assistantMessage);

    if (toolCalls.length === 0) {
      const finalText = sanitizeAssistantText(assistantMessage.content, deps.language);
      deps.send({ type: "assistant_text", text: finalText });
      await appendMessage(deps.conversationId, "assistant", finalText).catch((err) =>
        console.error("[toolLoop] appendMessage(assistant) failed", err)
      );
      deps.recordTaskStep("assistant_text", undefined, { ok: true, message: finalText });
      return { outcome: "completed" };
    }

    let awaitingConfirmation = false;
    for (const call of toolCalls) {
      const confirmationPrompt = CONFIRMATION_PROMPTS[call.name];
      if (confirmationPrompt) {
        // Never dispatch a confirmation-gated tool immediately — always
        // answer its tool_call with a placeholder and let a later turn
        // resolve it for real. If two such calls land in the same batch,
        // only the first becomes resolvable via pendingConfirmation; the
        // second is simply never run — a sensitive tool physically cannot
        // execute without going through this state machine, however the
        // batch is shaped.
        pendingConfirmation ??= { name: call.name, args: call.args };
        awaitingConfirmation = true;
        deps.history.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, message: messages.waitingForConfirmation }),
        });
        deps.recordTaskStep("confirmation_gate", call.name);
        continue;
      }
      const result = SERVER_TOOL_NAMES.has(call.name)
        ? await deps.handleServerTool(call.name, call.args, deps.userMessageId)
        : await deps.dispatchToolCall(call.id, call.name, call.args);
      deps.history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      deps.recordTaskStep(SERVER_TOOL_NAMES.has(call.name) ? "server_tool" : "tool_call", call.name, result);
    }

    if (awaitingConfirmation) {
      // Deterministic, not model-generated — reliable and free (no extra
      // Groq call), and avoids relying on the model to reliably follow
      // an "ask, don't call the tool again" instruction. See
      // docs/ARCHITECTURE.md.
      const confirmText = getConfirmationPrompt(deps.language, pendingConfirmation!.name)!(pendingConfirmation!.args);
      await deps.speakAndEndTurn(confirmText);
      return { outcome: "paused", pendingConfirmation };
    }
  }

  // Loop exhausted without an explicit break — matches existing behavior
  // exactly: falls through with no reply ever sent. A known, documented gap
  // (see docs/SYSTEM_AUDIT.md §3), not something this extraction silently
  // "fixes" — that would be a behavior change, not a refactor.
  return { outcome: "completed" };
}
