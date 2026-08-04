import type { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import type { ClientMessage, ServerMessage, ToolResult } from "../protocol.js";
import { runLlmStep, type ChatMessage } from "../llm.js";
import { transcribeAudio } from "../stt.js";
import { toolSchemasForCapabilities } from "../tools/schemas.js";
import { resolveGroqKey } from "../groqKey.js";
import { checkAndConsumeTurn, recordUsage } from "../rateLimit.js";
import { redis, conversationKey, CONVERSATION_TTL_SECONDS } from "../redis.js";
import { db } from "../db.js";
import { tryAcquireUserLock, releaseUserLock } from "./userLock.js";

const SYSTEM_PROMPT =
  "You are a helpful voice assistant running on the user's device. Replies are spoken " +
  "aloud, so be concise and conversational. Use the available tools to actually perform " +
  "actions rather than just describing what you'd do.";

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

      const transcript = await transcribeAudio(apiKey, audio);
      this.send({ type: "transcript", text: transcript });
      this.history.push({ role: "user", content: transcript });

      const tools = toolSchemasForCapabilities(this.capabilities);

      for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step++) {
        const { assistantMessage, toolCalls } = await runLlmStep(apiKey, this.history, tools);
        this.history.push(assistantMessage);

        if (toolCalls.length === 0) {
          this.send({ type: "assistant_text", text: assistantMessage.content });
          break;
        }

        for (const call of toolCalls) {
          const result = await this.dispatchToolCall(call.id, call.name, call.args);
          this.history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }

      await this.persist();
      recordUsage(this.userId, {}).catch(() => {});
    } catch (err) {
      this.send({ type: "error", code: "llm_failed", message: "Something went wrong processing that — try again." });
      console.error("[session] turn failed", err);
    } finally {
      releaseUserLock(this.userId);
    }
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
