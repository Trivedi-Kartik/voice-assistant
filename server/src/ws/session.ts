import type { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { ClientMessage, ServerMessage, ToolResult } from "../protocol.js";
import { runLlmStep, type ChatMessage } from "../llm.js";
import { transcribeAudio } from "../stt.js";
import { isGroqRateLimit, isRetryableToolUseFailure, getRetryAfterSeconds, formatWaitTime } from "../groqErrors.js";
import {
  toolSchemasForCapabilities,
  SERVER_TOOL_SCHEMAS,
  SERVER_TOOL_NAMES,
  AUTOMATION_TOOL_SCHEMAS,
  CONFIRMATION_PROMPTS,
} from "../tools/schemas.js";
import { AutomationRunner, type AutomationOutcome } from "../automation/runner.js";
import { TOOL_NAMES } from "../tools/toolNames.js";
import { LANGUAGE_NAMES, type LanguageCode } from "../i18n/languages.js";
import { getMessages } from "../i18n/messages.js";
import { classifyConfirmation } from "../i18n/confirmation.js";
import { getConfirmationPrompt } from "../i18n/confirmationPrompts.js";
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
// The rename to "Karvix" (see docs/CHANGELOG.md) only ever touched branding
// surfaces (window title, tray, package.json) — this prompt was never
// updated, so the model had no idea its own name was Karvix. Confirmed via
// real usage: greeting it by name got a confused/generic reply since
// "Karvix" was just an unexplained word to it.
const SYSTEM_PROMPT =
  "You are Karvix, a helpful voice assistant running on the user's device. If the user " +
  "greets you or addresses you by name, respond naturally as yourself, not as if asked " +
  "about a third party. Replies are spoken " +
  "aloud via text-to-speech, so: keep replies short and conversational, like natural " +
  "speech. Use the available tools to actually perform actions rather than just " +
  "describing what you'd do or asking the user to do it themselves. Never mention tool " +
  "or function names, and never include code, JSON, or programming syntax of any kind " +
  "in your reply — describe outcomes in plain language only (e.g. \"I found some results " +
  "for that\" or \"Chrome should be open now\"), never HOW you did it.";

// Defensive backstop, not the primary fix (that's the system prompt above): if a
// model still verbalizes a tool call as text instead of using the structured
// mechanism, never speak/show raw pseudo-code to the user. Confirmed real
// symptom, not hypothetical — reported from actual usage. Two shapes seen live:
// bare "web_search(query: ...)" prose, and a pseudo-XML wrapper like
// "<function(web_search){\"query\": \"...\"}</function>". Built from TOOL_NAMES
// so every current tool is covered, not just whichever ones prompted the first fix.
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

// Phase 2: relevant memories (semantic search over this user's remembered
// preferences, see memory/memoryStore.ts) get folded into the system prompt
// each turn — the model doesn't need to explicitly "call" a recall tool, the
// context is just already there, same shape as a typical RAG setup.
//
// Multi-language support: only appends a language directive when it's not
// "en" — keeps English's prompt byte-for-byte identical to before this
// feature existed (verified deliberately, see docs/ARCHITECTURE.md "Known
// reliability limitation" — no reason to risk regressing the one language
// this has always been tested in).
function buildSystemPrompt(memories: RelevantMemory[], language: string): string {
  let prompt = SYSTEM_PROMPT;
  if (language !== "en") {
    const languageName = LANGUAGE_NAMES[language as LanguageCode] ?? language;
    prompt +=
      ` Always respond only in ${languageName} — never in English. Keep app and product names ` +
      `(e.g. Chrome, Spotify) in their original form, untranslated.`;
  }
  if (memories.length === 0) return prompt;
  const facts = memories.map((m) => `- ${m.factText}`).join("\n");
  return `${prompt}\n\nThings you know about this user from past conversations:\n${facts}`;
}

// Groq's own rate limit (distinct from this app's per-user daily cap, see
// rateLimit.ts) can mean "wait a couple seconds" or "wait for tomorrow's quota
// reset" — those deserve different messages. Groq's `retry-after` header tells
// us which; without checking it, a 10-minute wait was getting reported as "try
// again in a few seconds," which is actively misleading.
function rateLimitMessage(err: unknown, language: string): string {
  const retryAfter = getRetryAfterSeconds(err);
  const messages = getMessages(language);
  return retryAfter !== null
    ? messages.rateLimitedWithWait(formatWaitTime(retryAfter, language))
    : messages.rateLimitedGeneric;
}

const TOOL_TIMEOUT_MS = 12_000;
// Mirrors the same override on the client (agent/src/main/tools/index.ts) —
// add_custom_app blocks on a human browsing a file dialog, so the server
// side of this same round-trip needs to wait at least as long, or it gives
// up on the client mid-pick. Every other tool keeps the strict default.
const TOOL_TIMEOUT_OVERRIDES: Partial<Record<string, number>> = {
  add_custom_app: 90_000,
};
const MAX_TOOL_LOOP_STEPS = 6; // bounded — a misbehaving model can't hang a session forever

// classifyConfirmation moved to i18n/confirmation.ts (per-language
// YES_WORDS/NO_WORDS) — still the same deliberately-simple keyword matching,
// not another LLM call, and unclear still defaults to "no" at the call site.

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
  // Set when a turn pauses on a tool in CONFIRMATION_PROMPTS — the *next*
  // turn's transcript is treated as the answer to this, not a new request.
  // Purely in-memory, like pendingCalls: lost on disconnect, which just means
  // a stale "yes" after a reconnect is treated as a fresh, contextless
  // utterance rather than an accidental confirmation — never a safety issue.
  private pendingConfirmation?: { name: string; args: unknown };
  // Computer-use automation (see server/src/automation/runner.ts) — a task can
  // span many turns whenever a high-risk step needs its own fresh spoken
  // confirmation. All three are in-memory, same lost-on-disconnect precedent
  // as pendingConfirmation/pendingCalls above.
  private activeAutomation?: AutomationRunner;
  private pendingAutomationConfirm = false;
  private pendingAutomationConfirmText?: string;

  private constructor(
    private readonly ws: WebSocket,
    readonly userId: string,
    readonly deviceId: string,
    private readonly capabilities: string[],
    // One of the 8 languages in i18n/languages.ts — a per-user preference
    // (see auth/routes.ts's /me/language), not a device capability. Drives
    // Whisper's STT language, the LLM's response-language directive, and
    // the confirmation classifier's YES_WORDS/NO_WORDS (see i18n/).
    private readonly language: string,
    conversationId?: string
  ) {
    this.conversationId = conversationId ?? uuid();
  }

  static async create(
    ws: WebSocket,
    userId: string,
    deviceId: string,
    capabilities: string[],
    language: string,
    resumeConversationId?: string
  ): Promise<Session> {
    const session = new Session(ws, userId, deviceId, capabilities, language, resumeConversationId);
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
      case "automation_observation":
        this.activeAutomation?.handleObservation(msg.taskId, msg.screenshot);
        return;
      case "automation_action_result":
        this.activeAutomation?.handleActionResult(msg.taskId, msg.result.ok, msg.result.message);
        return;
      case "automation_cancel":
        this.activeAutomation?.handleCancel(msg.taskId);
        return;
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
      pending.resolve({ ok: false, message: getMessages(this.language).deviceDisconnected });
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

    const messages = getMessages(this.language);

    if (!tryAcquireUserLock(this.userId)) {
      this.send({
        type: "error",
        code: "internal",
        message: messages.turnInProgress,
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
          message: messages.dailyLimitReached,
        });
        return;
      }

      let transcript: string;
      try {
        transcript = await transcribeAudio(apiKey, audio, this.language);
      } catch (err) {
        // Distinct from the LLM-loop catch below: a genuinely corrupted/silent
        // recording (or Groq being rate-limited on the STT call specifically)
        // is a different failure than the LLM mishandling a valid transcript,
        // and deserves a different, more specific message.
        console.error("[session] transcription failed", err);
        this.send({
          type: "error",
          code: "stt_failed",
          message: isGroqRateLimit(err) ? rateLimitMessage(err, this.language) : messages.sttUnclearError,
        });
        return;
      }

      // Silence, background noise, or an utterance too short/unclear for Whisper
      // to transcribe anything — don't waste an LLM call (and the user's daily
      // turn) on empty input; just ask them to repeat.
      if (!transcript) {
        this.send({ type: "error", code: "stt_failed", message: messages.sttEmptyError });
        return;
      }

      this.send({ type: "transcript", text: transcript });
      this.history.push({ role: "user", content: transcript });

      // Durable persistence (Phase 2) — best-effort, never blocks the turn.
      const userMessageId = await appendMessage(this.conversationId, "user", transcript).catch((err) => {
        console.error("[session] appendMessage(user) failed", err);
        return undefined;
      });

      // This turn's transcript is the answer to a question asked last turn,
      // not a new request — resolve it before anything else.
      //
      // Real bug, found via live testing: the previous version of this
      // re-answered the ORIGINAL tool_call_id from the question-asking turn
      // — but that call was already fully closed out then (see the
      // placeholder push in the mid-loop pause logic below). Re-answering an
      // already-answered call, with a fresh user message now sandwiched in
      // between, is an invalid message sequence (a `tool` message must
      // immediately follow the assistant message with the matching
      // `tool_calls`, not appear after unrelated turns) — which is almost
      // certainly why the model kept re-issuing the same call instead of
      // reacting sensibly to "yes." On a real confirmation, mint a
      // brand-new, self-contained tool_calls/tool exchange instead — no
      // reference to the old call at all. On decline, there's nothing to
      // answer: nothing was called, so just let the plain "no" flow into the
      // conversation as a normal user turn below.
      if (this.pendingConfirmation) {
        const pending = this.pendingConfirmation;
        this.pendingConfirmation = undefined;
        if (classifyConfirmation(transcript, this.language) === "yes") {
          const callId = uuid();
          this.history.push({
            role: "assistant",
            content: "",
            tool_calls: [{ id: callId, type: "function", function: { name: pending.name, arguments: JSON.stringify(pending.args) } }],
          });
          const result =
            pending.name === "computer_use_task"
              ? await this.startAutomation(pending.args)
              : SERVER_TOOL_NAMES.has(pending.name)
                ? await this.handleServerTool(pending.name, pending.args, userMessageId)
                : await this.dispatchToolCall(callId, pending.name, pending.args);
          this.history.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
          if (this.pendingAutomationConfirm) {
            await this.speakAndEndTurn(this.pendingAutomationConfirmText!);
            await this.finishTurnEarly();
            return;
          }
        }
      }

      // Distinct from pendingConfirmation above: an in-progress computer-use
      // task paused on a specific high-risk STEP (not the initial "start
      // automation?" gate, which is a normal pendingConfirmation case handled
      // above). Same "always mint a fresh, self-contained tool_calls/tool
      // pair" discipline — never leaves a call open across this pause.
      if (this.pendingAutomationConfirm && this.activeAutomation) {
        const proceed = classifyConfirmation(transcript, this.language) === "yes";
        this.pendingAutomationConfirm = false;
        const callId = uuid();
        this.history.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: { name: "computer_use_task", arguments: JSON.stringify({ goal: this.activeAutomation.goal }) },
            },
          ],
        });
        const result = await this.resumeAutomation(proceed);
        this.history.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
        if (this.pendingAutomationConfirm) {
          await this.speakAndEndTurn(this.pendingAutomationConfirmText!);
          await this.finishTurnEarly();
          return;
        }
      }

      const relevantMemories = await findRelevantMemories(this.userId, transcript).catch((err) => {
        console.error("[session] findRelevantMemories failed", err);
        return [] as RelevantMemory[];
      });
      this.history[0] = { role: "system", content: buildSystemPrompt(relevantMemories, this.language) };

      const tools = [...toolSchemasForCapabilities(this.capabilities), ...SERVER_TOOL_SCHEMAS, ...AUTOMATION_TOOL_SCHEMAS];

      for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step++) {
        let assistantMessage, toolCalls;
        for (let leakAttempt = 0; ; leakAttempt++) {
          ({ assistantMessage, toolCalls } = await runLlmStep(apiKey, this.history, tools));
          const leaked = toolCalls.length === 0 && looksLikeLeakedToolCall(assistantMessage.content);
          if (!leaked || leakAttempt >= MAX_LEAKED_CALL_RETRIES) break;
          console.warn(`[llm] retrying leaked tool-call-as-text (attempt ${leakAttempt + 1}/${MAX_LEAKED_CALL_RETRIES})`);
        }
        this.history.push(assistantMessage);

        if (toolCalls.length === 0) {
          const finalText = sanitizeAssistantText(assistantMessage.content, this.language);
          this.send({ type: "assistant_text", text: finalText });
          await appendMessage(this.conversationId, "assistant", finalText).catch((err) =>
            console.error("[session] appendMessage(assistant) failed", err)
          );
          break;
        }

        let awaitingConfirmation = false;
        for (const call of toolCalls) {
          const confirmationPrompt = CONFIRMATION_PROMPTS[call.name];
          if (confirmationPrompt) {
            // Never dispatch a confirmation-gated tool immediately — always
            // answer its tool_call with a placeholder and let a later turn
            // (see above) resolve it for real. If two such calls land in
            // the same batch, only the first becomes resolvable via
            // pendingConfirmation; the second is simply never run — a
            // sensitive tool physically cannot execute without going
            // through this state machine, however the batch is shaped.
            this.pendingConfirmation ??= { name: call.name, args: call.args };
            awaitingConfirmation = true;
            this.history.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, message: messages.waitingForConfirmation }),
            });
            continue;
          }
          const result = SERVER_TOOL_NAMES.has(call.name)
            ? await this.handleServerTool(call.name, call.args, userMessageId)
            : await this.dispatchToolCall(call.id, call.name, call.args);
          this.history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }

        if (awaitingConfirmation) {
          // Deterministic, not model-generated — reliable and free (no extra
          // Groq call), and avoids relying on the model to reliably follow
          // an "ask, don't call the tool again" instruction. See
          // docs/ARCHITECTURE.md.
          const pending = this.pendingConfirmation!;
          const confirmText = getConfirmationPrompt(this.language, pending.name)!(pending.args);
          await this.speakAndEndTurn(confirmText);
          break;
        }
      }

      await this.finishTurnEarly();
    } catch (err) {
      // Both checks catch the exhausted-retries case too (see llm.ts) — these
      // are known, expected occasional failures (a malformed-tool-call
      // generation quirk seen on Groq, or genuine rate limiting), not mystery
      // bugs, so give a more actionable message than the generic fallback.
      const message = isRetryableToolUseFailure(err)
        ? messages.toolUseFailedRetry
        : isGroqRateLimit(err)
          ? rateLimitMessage(err, this.language)
          : messages.turnFailedGeneric;
      this.send({ type: "error", code: "llm_failed", message });
      console.error("[session] turn failed", err);
    } finally {
      releaseUserLock(this.userId);
    }
  }

  // Shared by both the "start automation?" and any later "about to <risky
  // step> — go ahead?" prompts: speak a deterministic line directly (no extra
  // LLM call, same reasoning as the existing awaitingConfirmation prompt) and
  // let the turn end there rather than letting the main LLM chat over it.
  private async speakAndEndTurn(text: string): Promise<void> {
    this.history.push({ role: "assistant", content: text });
    this.send({ type: "assistant_text", text });
    await appendMessage(this.conversationId, "assistant", text).catch((err) =>
      console.error("[session] appendMessage(assistant) failed", err)
    );
  }

  private async finishTurnEarly(): Promise<void> {
    await this.persist();
    recordUsage(this.userId, {}).catch(() => {});
  }

  // Kicks off a computer-use task right after the user confirmed the initial
  // "this lets me click/type on your screen" gate. Runs until the task
  // finishes, needs a fresh spoken confirmation for a high-risk step, or hits
  // its step/time budget — see automation/runner.ts.
  private async startAutomation(args: unknown): Promise<ToolResult> {
    const messages = getMessages(this.language);
    const parsed = z.object({ goal: z.string().min(3) }).safeParse(args);
    if (!parsed.success) return { ok: false, message: "Couldn't understand what to automate." };
    const { apiKey } = await resolveGroqKey(this.userId);
    const runner = new AutomationRunner(this.userId, this.deviceId, parsed.data.goal, apiKey, (msg) => this.send(msg));
    this.activeAutomation = runner;
    return this.driveAutomation(runner.run("start"), messages);
  }

  // Resumes an in-progress task after the user answered a risky-step
  // confirmation. `proceed=false` ends the whole task, not just that step —
  // a simple, unambiguous default (see automation/runner.ts).
  private async resumeAutomation(proceed: boolean): Promise<ToolResult> {
    const messages = getMessages(this.language);
    const runner = this.activeAutomation!;
    return this.driveAutomation(runner.run(proceed ? "resume-confirmed" : "resume-cancelled"), messages);
  }

  private async driveAutomation(
    outcomePromise: Promise<AutomationOutcome>,
    messages: ReturnType<typeof getMessages>
  ): Promise<ToolResult> {
    const outcome = await outcomePromise;
    if (outcome.kind === "needs_confirmation") {
      this.pendingAutomationConfirm = true;
      this.pendingAutomationConfirmText = messages.automationConfirmAction(outcome.description);
      return { ok: false, message: messages.waitingForConfirmation };
    }
    this.activeAutomation = undefined;
    return { ok: true, message: outcome.summary };
  }

  // Server-handled tools (Phase 2) never round-trip to the client — they don't
  // touch the user's OS, so there's no reason to pay a WebSocket round-trip or
  // give the client anything to execute. Unlike dispatchToolCall, this resolves
  // synchronously within the same turn.
  private async handleServerTool(name: string, args: unknown, sourceMessageId?: string): Promise<ToolResult> {
    const messages = getMessages(this.language);
    if (name === "remember_preference") {
      const parsed = z.object({ fact: z.string().min(3) }).safeParse(args);
      if (!parsed.success) return { ok: false, message: messages.factNotSaved };
      try {
        await saveMemoryFact(this.userId, parsed.data.fact, sourceMessageId);
        return { ok: true, message: messages.factSaved };
      } catch (err) {
        console.error("[session] saveMemoryFact failed", err);
        return { ok: false, message: messages.factSaveFailed };
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
              resolve({ ok: false, message: getMessages(this.language).toolTimedOut });
            }, TOOL_TIMEOUT_OVERRIDES[name] ?? TOOL_TIMEOUT_MS);

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
