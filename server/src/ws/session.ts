import type { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { ClientMessage, ServerMessage, ToolResult } from "../protocol.js";
import { runLlmStep, type ChatMessage } from "../llm.js";
import { transcribeAudio } from "../stt.js";
import { isGroqRateLimit, isRetryableToolUseFailure, getRetryAfterSeconds, formatWaitTime } from "../groqErrors.js";
import { toolSchemasForCapabilities, SERVER_TOOL_SCHEMAS, SERVER_TOOL_NAMES } from "../tools/schemas.js";
import { resolveGroqKey } from "../groqKey.js";
import { checkAndConsumeTurn, recordUsage } from "../rateLimit.js";
import { redis, conversationKey, CONVERSATION_TTL_SECONDS } from "../redis.js";
import { db } from "../db.js";
import { tryAcquireUserLock, releaseUserLock } from "./userLock.js";
import { createConversation, appendMessage } from "../memory/conversationStore.js";
import { saveMemoryFact, findRelevantMemories, type RelevantMemory } from "../memory/memoryStore.js";

// Explicit about never verbalizing tool/function mechanics: without this, models
// occasionally narrate their own tool usage in plain-text form (e.g. literally
// writing "web_search(query: ...)" as if it were prose) instead of using the
// structured tool-calling mechanism — that text then gets spoken/shown to the
// user verbatim. sanitizeAssistantText() below is the defensive backstop for
// when a model does this anyway.
const SYSTEM_PROMPT =
  "You are a helpful voice assistant running on the user's device. Replies are spoken " +
  "aloud via text-to-speech, so: keep replies short and conversational, like natural " +
  "speech. Use the available tools to actually perform actions rather than just " +
  "describing what you'd do or asking the user to do it themselves. Never mention tool " +
  "or function names, and never include code, JSON, or programming syntax of any kind " +
  "in your reply — describe outcomes in plain language only (e.g. \"I found some results " +
  "for that\" or \"Chrome should be open now\"), never HOW you did it.";

// Defensive backstop, not the primary fix (that's the system prompt above): if a
// model still verbalizes a tool call as text instead of using the structured
// mechanism, never speak/show raw pseudo-code to the user. Confirmed real
// symptom, not hypothetical — reported from actual usage.
function sanitizeAssistantText(text: string): string {
  let cleaned = text.replace(/```[\s\S]*?```/g, "").trim();
  cleaned = cleaned.replace(/\b(open_app|web_search|open_url)\s*\([^)]*\)/gi, "").trim();
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Done.";
}

// Phase 2: relevant memories (semantic search over this user's remembered
// preferences, see memory/memoryStore.ts) get folded into the system prompt
// each turn — the model doesn't need to explicitly "call" a recall tool, the
// context is just already there, same shape as a typical RAG setup.
function buildSystemPrompt(memories: RelevantMemory[]): string {
  if (memories.length === 0) return SYSTEM_PROMPT;
  const facts = memories.map((m) => `- ${m.factText}`).join("\n");
  return `${SYSTEM_PROMPT}\n\nThings you know about this user from past conversations:\n${facts}`;
}

// Groq's own rate limit (distinct from this app's per-user daily cap, see
// rateLimit.ts) can mean "wait a couple seconds" or "wait for tomorrow's quota
// reset" — those deserve different messages. Groq's `retry-after` header tells
// us which; without checking it, a 10-minute wait was getting reported as "try
// again in a few seconds," which is actively misleading.
function rateLimitMessage(err: unknown): string {
  const retryAfter = getRetryAfterSeconds(err);
  return retryAfter !== null
    ? `Groq's usage limit is temporarily reached — try again in about ${formatWaitTime(retryAfter)}.`
    : "Things are a bit busy right now — please try again in a few seconds.";
}

const TOOL_TIMEOUT_MS = 12_000;
const MAX_TOOL_LOOP_STEPS = 6; // bounded — a misbehaving model can't hang a session forever

interface PendingCall {
  resolve: (result: ToolResult) => void;
  timer: NodeJS.Timeout;
  invocationId: string;
}

// One WS connection = one Session. Every tool_call this session issues carries a
// server-generated callId scoped to THIS instance's `pendingCalls` map — a
// tool_result for a callId pending on a different connection is structurally
// impossible to route here, which is what makes cross-user leakage a non-issue
// rather than something enforced only by convention.
export class Session {
  conversationId: string;
  private audioChunks: Buffer[] = [];
  private readonly pendingCalls = new Map<string, PendingCall>();
  private history: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  private constructor(
    private readonly ws: WebSocket,
    readonly userId: string,
    readonly deviceId: string,
    private readonly capabilities: string[],
    conversationId?: string
  ) {
    this.conversationId = conversationId ?? uuid();
  }

  static async create(
    ws: WebSocket,
    userId: string,
    deviceId: string,
    capabilities: string[],
    resumeConversationId?: string
  ): Promise<Session> {
    const session = new Session(ws, userId, deviceId, capabilities, resumeConversationId);
    if (resumeConversationId) {
      const raw = await redis.get(conversationKey(userId, resumeConversationId));
      if (raw) session.history = JSON.parse(raw) as ChatMessage[];
    } else {
      // Durable record (Phase 2) — best-effort: a hiccup here shouldn't block
      // the core voice loop, which worked fine before this feature existed.
      await createConversation(session.conversationId, userId, deviceId).catch((err) =>
        console.error("[session] createConversation failed", err)
      );
    }
    return session;
  }

  async handleMessage(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "audio_chunk":
        this.audioChunks.push(Buffer.from(msg.data, "base64"));
        return;
      case "audio_end":
        await this.runTurn();
        return;
      case "tool_result":
        this.resolveToolCall(msg.callId, msg.result);
        return;
      case "resume":
        await this.resumeFrom(msg.conversationId);
        return;
      case "auth":
        return; // handled at connection setup, not mid-session
    }
  }

  private async resumeFrom(conversationId: string): Promise<void> {
    this.conversationId = conversationId;
    const raw = await redis.get(conversationKey(this.userId, conversationId));
    if (raw) this.history = JSON.parse(raw) as ChatMessage[];
  }

  // Called when the socket closes with tool calls still outstanding — resolves
  // them so nothing waits on a promise nobody will ever fulfill.
  handleDisconnect(): void {
    for (const pending of this.pendingCalls.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, message: "Device disconnected before finishing this action." });
      db.toolInvocation
        .update({ where: { id: pending.invocationId }, data: { status: "timeout", completedAt: new Date() } })
        .catch(() => {});
    }
    this.pendingCalls.clear();
  }

  private resolveToolCall(callId: string, result: ToolResult): void {
    const pending = this.pendingCalls.get(callId);
    if (!pending) return; // stale/unknown callId (e.g. a prior generation) — ignore
    clearTimeout(pending.timer);
    this.pendingCalls.delete(callId);
    pending.resolve(result);
  }

  private send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async runTurn(): Promise<void> {
    const audio = Buffer.concat(this.audioChunks);
    this.audioChunks = [];
    if (audio.length === 0) return;

    if (!tryAcquireUserLock(this.userId)) {
      this.send({
        type: "error",
        code: "internal",
        message: "Still working on your last request — one moment.",
      });
      return;
    }

    try {
      const { apiKey, isByok } = await resolveGroqKey(this.userId);

      const turnCheck = await checkAndConsumeTurn(this.userId, isByok);
      if (!turnCheck.allowed) {
        this.send({
          type: "error",
          code: "rate_limited",
          message:
            "You've hit today's free limit. Add your own Groq API key in Settings for unlimited use, or try again after midnight UTC.",
        });
        return;
      }

      let transcript: string;
      try {
        transcript = await transcribeAudio(apiKey, audio);
      } catch (err) {
        // Distinct from the LLM-loop catch below: a genuinely corrupted/silent
        // recording (or Groq being rate-limited on the STT call specifically)
        // is a different failure than the LLM mishandling a valid transcript,
        // and deserves a different, more specific message.
        console.error("[session] transcription failed", err);
        this.send({
          type: "error",
          code: "stt_failed",
          message: isGroqRateLimit(err) ? rateLimitMessage(err) : "I didn't catch that clearly — could you try again?",
        });
        return;
      }

      // Silence, background noise, or an utterance too short/unclear for Whisper
      // to transcribe anything — don't waste an LLM call (and the user's daily
      // turn) on empty input; just ask them to repeat.
      if (!transcript) {
        this.send({ type: "error", code: "stt_failed", message: "I didn't catch that — could you try again?" });
        return;
      }

      this.send({ type: "transcript", text: transcript });
      this.history.push({ role: "user", content: transcript });

      // Durable persistence (Phase 2) — best-effort, never blocks the turn.
      const userMessageId = await appendMessage(this.conversationId, "user", transcript).catch((err) => {
        console.error("[session] appendMessage(user) failed", err);
        return undefined;
      });

      const relevantMemories = await findRelevantMemories(this.userId, transcript).catch((err) => {
        console.error("[session] findRelevantMemories failed", err);
        return [] as RelevantMemory[];
      });
      this.history[0] = { role: "system", content: buildSystemPrompt(relevantMemories) };

      const tools = [...toolSchemasForCapabilities(this.capabilities), ...SERVER_TOOL_SCHEMAS];

      for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step++) {
        const { assistantMessage, toolCalls } = await runLlmStep(apiKey, this.history, tools);
        this.history.push(assistantMessage);

        if (toolCalls.length === 0) {
          const finalText = sanitizeAssistantText(assistantMessage.content);
          this.send({ type: "assistant_text", text: finalText });
          await appendMessage(this.conversationId, "assistant", finalText).catch((err) =>
            console.error("[session] appendMessage(assistant) failed", err)
          );
          break;
        }

        for (const call of toolCalls) {
          const result = SERVER_TOOL_NAMES.has(call.name)
            ? await this.handleServerTool(call.name, call.args, userMessageId)
            : await this.dispatchToolCall(call.id, call.name, call.args);
          this.history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }

      await this.persist();
      recordUsage(this.userId, {}).catch(() => {});
    } catch (err) {
      // Both checks catch the exhausted-retries case too (see llm.ts) — these
      // are known, expected occasional failures (Groq's Llama 3.3 tool-call
      // generation quirk, or genuine rate limiting), not mystery bugs, so give
      // a more actionable message than the generic fallback.
      const message = isRetryableToolUseFailure(err)
        ? "I had trouble with that — try asking one thing at a time."
        : isGroqRateLimit(err)
          ? rateLimitMessage(err)
          : "Something went wrong processing that — try again.";
      this.send({ type: "error", code: "llm_failed", message });
      console.error("[session] turn failed", err);
    } finally {
      releaseUserLock(this.userId);
    }
  }

  // Server-handled tools (Phase 2) never round-trip to the client — they don't
  // touch the user's OS, so there's no reason to pay a WebSocket round-trip or
  // give the client anything to execute. Unlike dispatchToolCall, this resolves
  // synchronously within the same turn.
  private async handleServerTool(name: string, args: unknown, sourceMessageId?: string): Promise<ToolResult> {
    if (name === "remember_preference") {
      const parsed = z.object({ fact: z.string().min(3) }).safeParse(args);
      if (!parsed.success) return { ok: false, message: "That didn't look like a fact I could save." };
      try {
        await saveMemoryFact(this.userId, parsed.data.fact, sourceMessageId);
        return { ok: true, message: "Got it, I'll remember that." };
      } catch (err) {
        console.error("[session] saveMemoryFact failed", err);
        return { ok: false, message: "Couldn't save that right now." };
      }
    }
    return { ok: false, message: `Unknown server tool "${name}".` };
  }

  private dispatchToolCall(callId: string, name: string, args: unknown): Promise<ToolResult> {
    return db.toolInvocation
      .create({ data: { userId: this.userId, deviceId: this.deviceId, toolName: name, args: args as object, status: "pending" } })
      .then(
        (invocation) =>
          new Promise<ToolResult>((resolve) => {
            const timer = setTimeout(() => {
              this.pendingCalls.delete(callId);
              db.toolInvocation
                .update({ where: { id: invocation.id }, data: { status: "timeout", completedAt: new Date() } })
                .catch(() => {});
              resolve({ ok: false, message: "Tool timed out" });
            }, TOOL_TIMEOUT_MS);

            this.pendingCalls.set(callId, {
              timer,
              invocationId: invocation.id,
              resolve: (result) => {
                db.toolInvocation
                  .update({
                    where: { id: invocation.id },
                    data: { status: result.ok ? "success" : "error", result: result as object, completedAt: new Date() },
                  })
                  .catch(() => {});
                resolve(result);
              },
            });

            this.send({ type: "tool_call", callId, name, args });
          })
      );
  }

  private async persist(): Promise<void> {
    await redis.set(
      conversationKey(this.userId, this.conversationId),
      JSON.stringify(this.history),
      "EX",
      CONVERSATION_TTL_SECONDS
    );
  }
}
