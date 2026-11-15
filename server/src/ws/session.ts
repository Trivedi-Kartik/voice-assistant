import type { WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ClientMessage, ServerMessage, ToolResult } from "../protocol.js";
import type { ChatMessage } from "../llm.js";
import { transcribeAudio, isTrivialTranscript } from "../stt.js";
import { isGroqRateLimit, isRetryableToolUseFailure, getRetryAfterSeconds, formatWaitTime } from "../groqErrors.js";
import { SERVER_TOOL_NAMES } from "../tools/schemas.js";
import { AutomationRunner, type AutomationOutcome } from "../automation/runner.js";
import { LANGUAGE_NAMES, type LanguageCode } from "../i18n/languages.js";
import { getMessages } from "../i18n/messages.js";
import { classifyConfirmation } from "../i18n/confirmation.js";
import { resolveGroqKey } from "../groqKey.js";
import { runToolLoop } from "../toolLoop.js";
import { checkAndConsumeTurn, checkAndConsumePcTask, recordUsage } from "../rateLimit.js";
import { redis, conversationKey, CONVERSATION_TTL_SECONDS } from "../redis.js";
import { db } from "../db.js";
import { tryAcquireUserLock, releaseUserLock } from "./userLock.js";
import { createConversation, appendMessage } from "../memory/conversationStore.js";
import { saveMemoryFact, findRelevantMemories, type RelevantMemory } from "../memory/memoryStore.js";
import { trimHistory } from "./historyTrim.js";
import { env } from "../env.js";
import { speech } from "../tts/index.js";
import { AgentRunner } from "../agent/runner.js";
import { selectPlanner } from "../agent/plannerSelection.js";
import { WsAgentDevice } from "../agent/wsDevice.js";
import type { AgentOutcome } from "../agent/types.js";
import { createTask, appendTaskStep, completeTask, type TaskStatus, type TaskStepKind } from "../tasks/taskStore.js";

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
  "describing what you'd do or asking the user to do it themselves. If a tool needs " +
  "confirmation, the system asks that automatically the moment you call it — never ask " +
  "\"should I go ahead?\" or similar in your own words first, and never call the same tool " +
  "again for a request you already called it for; that just makes the user confirm the " +
  "same thing twice or more. Never mention tool or function names, and never include code, " +
  "JSON, or programming syntax of any kind in your reply — describe outcomes in plain " +
  "language only (e.g. \"I found some results for that\" or \"Chrome should be open now\"), " +
  "never HOW you did it.";

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

// ~10 MB of webm/opus is many minutes of speech; anything beyond is a bug or abuse, not an utterance.
const MAX_UTTERANCE_BYTES = 10 * 1024 * 1024;

const KNOWN_CLIENT_FEATURES = new Set(["pc_agent", "assistant_audio"]);
const TOOL_TIMEOUT_MS = 12_000;
// Mirrors the same override on the client (agent/src/main/tools/index.ts) —
// add_custom_app blocks on a human browsing a file dialog, so the server
// side of this same round-trip needs to wait at least as long, or it gives
// up on the client mid-pick. Every other tool keeps the strict default.
const TOOL_TIMEOUT_OVERRIDES: Partial<Record<string, number>> = {
  add_custom_app: 90_000,
};

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
  // A client can stream audio_chunk frames without ever sending audio_end; without a cap that
  // grows the heap until the whole process is OOM-killed (taking every user down with it).
  private audioBytes = 0;
  private audioOverflow = false;
  // Set by client_hello: this client build can play server-synthesized speech.
  private supportsServerAudio = false;
  // Optional features announced by this client build (client_hello), e.g. "pc_agent".
  private clientFeatures: string[] = [];
  // Karvix 2 PC agent: at most one task per connection; it can span turns while it waits for an answer.
  private activeAgent?: AgentRunner;
  private agentDevice?: WsAgentDevice;
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
  // Phase 1 slice 4: cooperative cancellation for the in-flight turn (see
  // ../toolLoop.ts's isCancelled check) — reset at the start of every
  // runTurn(). currentTaskId mirrors the Task created for whichever turn is
  // currently running, purely so handleDisconnect() (a different method than
  // runTurn(), which owns the real local `taskId`) can mark it abandoned if
  // the socket closes mid-turn — see handleDisconnect() below.
  private cancelRequested = false;
  private currentTaskId?: string;

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
      case "audio_chunk": {
        if (this.audioOverflow) return;
        const chunk = Buffer.from(msg.data, "base64");
        this.audioBytes += chunk.length;
        if (this.audioBytes > MAX_UTTERANCE_BYTES) {
          this.audioOverflow = true;
          this.audioChunks = [];
          return;
        }
        this.audioChunks.push(chunk);
        return;
      }
      case "audio_end":
        if (this.audioOverflow) {
          this.audioOverflow = false;
          this.audioBytes = 0;
          this.audioChunks = [];
          this.send({ type: "error", code: "stt_failed", message: getMessages(this.language).sttUnclearError });
          return;
        }
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
      case "task_cancel":
        this.cancelRequested = true;
        this.cancelAgent();
        return;
      case "client_hello":
        this.supportsServerAudio = msg.features.includes("assistant_audio");
        // Only features we know. This list is merged into the tool-offer capabilities, so an arbitrary string from a client
        // must never be able to add itself.
        this.clientFeatures = msg.features.filter((f) => KNOWN_CLIENT_FEATURES.has(f));
        return;
      case "agent_response":
        if (this.activeAgent && msg.taskId === this.activeAgent.id) this.agentDevice?.handleResponse(msg.requestId, msg.result);
        return;
      case "agent_cancel":
        if (this.activeAgent && msg.taskId === this.activeAgent.id) this.cancelAgent();
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
    // The client is gone: stop the in-flight loop at its next safe point instead of letting it
    // burn LLM calls and wait out a full tool timeout per step, and free any automation wait so
    // runTurn() can finish and release the user's turn lock.
    this.cancelRequested = true;
    this.cancelAgent();
    this.activeAutomation?.abort("disconnected");
    this.activeAutomation = undefined;
    this.pendingAutomationConfirm = false;
    this.pendingAutomationConfirmText = undefined;
    this.pendingConfirmation = undefined;

    for (const pending of this.pendingCalls.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, message: getMessages(this.language).deviceDisconnected });
      db.toolInvocation
        .update({ where: { id: pending.invocationId }, data: { status: "timeout", completedAt: new Date() } })
        .catch(() => {});
    }
    this.pendingCalls.clear();

    // Phase 1 slice 4, "resume" scope: without this, a Task whose turn never
    // reached a completeTask() call before the socket closed would sit at
    // status:"running" in the database forever, misleadingly implying it's
    // still active. This does NOT replay/resume the turn itself — that needs
    // real checkpointing this repo doesn't have yet, not invented here.
    if (this.currentTaskId) {
      const taskId = this.currentTaskId;
      this.currentTaskId = undefined;
      void completeTask(taskId, "failed").catch((err) => console.error("[session] completeTask failed", err));
    }
  }

  private resolveToolCall(callId: string, result: ToolResult): void {
    const pending = this.pendingCalls.get(callId);
    if (!pending) return; // stale/unknown callId (e.g. a prior generation) — ignore
    clearTimeout(pending.timer);
    this.pendingCalls.delete(callId);
    pending.resolve(result);
  }

  // The single path every spoken reply takes: text first (shown immediately), then — for clients that
  // support it and when TTS is configured — natural-voice audio chunks streamed in order.
  private speak(text: string): void {
    const withAudio = this.supportsServerAudio && speech.enabled;
    // replyId ties the audio chunks to this reply, so late chunks from a reply the user stopped can never
    // be played as the start of the next one.
    const replyId = uuid();
    this.send({ type: "assistant_text", text, ...(withAudio ? { audioFollows: true, replyId } : {}) });
    if (withAudio) {
      void speech.stream(text, this.language, replyId, (m) => this.send(m)).catch((err) => console.error("[tts] stream failed", err));
    }
  }

  private send(msg: ServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async runTurn(): Promise<void> {
    const audio = Buffer.concat(this.audioChunks);
    this.audioChunks = [];
    this.audioBytes = 0;
    if (audio.length === 0) return;

    this.cancelRequested = false;
    this.history = trimHistory(this.history);
    const messages = getMessages(this.language);
    // Phase 1 slice 2: one Task per runTurn() call, created once a real
    // transcript exists (nothing worth recording before that). Declared here,
    // outside the try block, so the catch block below can still mark it
    // failed. `undefined` (create failed, or never reached) means every
    // task-recording call below is a safe no-op — see taskStore.ts.
    let taskId: string | undefined;
    let taskStepCounter = 0;
    let taskFinalStatus: TaskStatus = "completed";
    const recordTaskStep = (kind: TaskStepKind, toolName?: string, result?: ToolResult) => {
      if (!taskId) return;
      void appendTaskStep(taskId, taskStepCounter++, {
        kind,
        toolName,
        resultOk: result?.ok,
        resultMessage: result?.message,
      }).catch((err) => console.error("[session] appendTaskStep failed", err));
    };

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
        // Temporary diagnostic (remove once the "could not process file" cause
        // is confirmed): a valid WebM/EBML file always starts with byte
        // sequence 1a 45 df a3 — if this header is missing/short, the client
        // sent a corrupted or empty recording, not a server/API problem.
        console.error(
          `[session] transcription failed — audio buffer: ${audio.length} bytes, first 8 bytes: ${audio.subarray(0, 8).toString("hex")}`
        );
        console.error("[session] transcription failed", err);
        // Temporary debug aid (local dev only — gated behind an explicit env
        // var so this can never accidentally run anywhere else): saves the
        // exact rejected buffer to disk so it can be inspected directly
        // (e.g. `ffprobe`/a hex editor) instead of guessing from an 8-byte
        // prefix. Set DEBUG_DUMP_FAILED_AUDIO=1 to enable. Remove once the
        // "could not process file" cause is confirmed.
        if (process.env.DEBUG_DUMP_FAILED_AUDIO === "1") {
          const dumpPath = path.join(os.tmpdir(), `karvix-failed-audio-${Date.now()}.webm`);
          fs.writeFile(dumpPath, audio)
            .then(() => console.error(`[session] dumped failed audio buffer to ${dumpPath}`))
            .catch((writeErr) => console.error("[session] failed to dump audio buffer", writeErr));
        }
        this.send({
          type: "error",
          code: "stt_failed",
          message: isGroqRateLimit(err) ? rateLimitMessage(err, this.language) : messages.sttUnclearError,
        });
        return;
      }

      // Silence, background noise, or an utterance too short/unclear for Whisper
      // to transcribe anything — don't waste an LLM call (and the user's daily
      // turn) on empty input; just ask them to repeat. isTrivialTranscript
      // also catches the non-empty-but-content-free case (Whisper
      // hallucinating "." or a stray letter on near-silent audio) that a
      // plain `!transcript` check misses — see stt.ts.
      if (!transcript || isTrivialTranscript(transcript)) {
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

      taskId = await createTask(this.userId, this.deviceId, this.conversationId, transcript).catch((err) => {
        console.error("[session] createTask failed", err);
        return undefined;
      });
      this.currentTaskId = taskId;

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
      // Karvix 2 PC agent waiting on the user: this transcript is its answer (a yes/no for a risky step,
      // or the reply to its question). Same "fresh, self-contained tool_calls/tool pair" discipline as
      // the other pauses — the original pc_task call was already answered with a placeholder.
      if (this.activeAgent?.waiting) {
        const runner = this.activeAgent;
        const outcome =
          runner.waiting === "confirm"
            ? await runner.resumeWithConfirmation(classifyConfirmation(transcript, this.language) === "yes")
            : await runner.resumeWithAnswer(transcript);
        const result = this.agentOutcomeToResult(outcome);
        const callId = uuid();
        this.history.push({
          role: "assistant",
          content: "",
          tool_calls: [{ id: callId, type: "function", function: { name: "pc_task", arguments: JSON.stringify({ goal: runner.goal }) } }],
        });
        this.history.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
        recordTaskStep("server_tool", "pc_task", result);
        const pauseWith = (result.data as { speakAndPause?: string } | undefined)?.speakAndPause;
        if (pauseWith) {
          await this.speakAndEndTurn(pauseWith);
          if (taskId) void completeTask(taskId, "paused").catch((err) => console.error("[session] completeTask failed", err));
          this.currentTaskId = undefined;
          await this.finishTurnEarly();
          return;
        }
        // Finished: fall through so the model replies naturally to the task's result.
      }

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
          recordTaskStep(
            pending.name === "computer_use_task" ? "automation" : SERVER_TOOL_NAMES.has(pending.name) ? "server_tool" : "tool_call",
            pending.name,
            result
          );
          if (this.pendingAutomationConfirm) {
            await this.speakAndEndTurn(this.pendingAutomationConfirmText!);
            if (taskId) void completeTask(taskId, "paused").catch((err) => console.error("[session] completeTask failed", err));
            this.currentTaskId = undefined;
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
        recordTaskStep("automation", "computer_use_task", result);
        if (this.pendingAutomationConfirm) {
          await this.speakAndEndTurn(this.pendingAutomationConfirmText!);
          if (taskId) void completeTask(taskId, "paused").catch((err) => console.error("[session] completeTask failed", err));
          this.currentTaskId = undefined;
          await this.finishTurnEarly();
          return;
        }
      }

      const relevantMemories = await findRelevantMemories(this.userId, transcript).catch((err) => {
        console.error("[session] findRelevantMemories failed", err);
        return [] as RelevantMemory[];
      });
      this.history[0] = { role: "system", content: buildSystemPrompt(relevantMemories, this.language) };

      // Phase 1 slice 3: the tool-calling loop itself now lives in
      // ../toolLoop.ts, extracted specifically so it's callable independent
      // of a live WS connection — see docs/TARGET_ARCHITECTURE.md §3. Every
      // side effect it needs goes through this small deps object; it has no
      // notion of "Session" or "WebSocket" at all.
      const loopResult = await runToolLoop({
        apiKey,
        language: this.language,
        capabilities: [...this.capabilities, ...this.clientFeatures],
        conversationId: this.conversationId,
        history: this.history,
        userMessageId,
        dispatchToolCall: (callId, name, args) => this.dispatchToolCall(callId, name, args),
        handleServerTool: (name, args, sourceMessageId) => this.handleServerTool(name, args, sourceMessageId),
        speakAndEndTurn: (text) => this.speakAndEndTurn(text),
        recordTaskStep,
        send: (msg) => (msg.type === "assistant_text" ? this.speak(msg.text) : this.send(msg)),
        isCancelled: () => this.cancelRequested,
      });
      this.pendingConfirmation = loopResult.pendingConfirmation;
      taskFinalStatus =
        loopResult.outcome === "paused" ? "paused" : loopResult.outcome === "cancelled" ? "cancelled" : "completed";

      if (taskId) void completeTask(taskId, taskFinalStatus).catch((err) => console.error("[session] completeTask failed", err));
      this.currentTaskId = undefined;
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
      if (taskId) void completeTask(taskId, "failed").catch((e) => console.error("[session] completeTask failed", e));
      this.currentTaskId = undefined;
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
    this.speak(text);
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
  private cancelAgent(): void {
    this.activeAgent?.cancel();
    this.agentDevice?.abort("task cancelled");
  }

  private async startAgent(args: unknown): Promise<ToolResult> {
    const parsed = z.object({ goal: z.string().min(2).max(2000) }).safeParse(args);
    if (!parsed.success) return { ok: false, message: "I didn't get what to do on the computer." };
    this.cancelAgent(); // one task at a time
    const selected = await selectPlanner(this.userId);
    const allowance = await checkAndConsumePcTask(this.userId, selected.usesOwnKey).catch(() => ({ allowed: true, remaining: 0 }));
    if (!allowance.allowed) return { ok: false, message: getMessages(this.language).pcTaskLimitReached(env.pcTaskDailyCap) };
    const taskId = uuid();
    const device = new WsAgentDevice(taskId, (m) => this.send(m));
    const runner = new AgentRunner({
      id: taskId,
      goal: parsed.data.goal,
      language: this.language,
      device,
      planner: selected.planner,
      onStatus: (s) => this.send({ type: "agent_status", taskId, ...s }),
    });
    this.activeAgent = runner;
    this.agentDevice = device;
    return this.agentOutcomeToResult(await runner.start());
  }

  // Maps a runner outcome to the pc_task tool result. ask/confirm keep the runner alive and end the turn
  // with the question spoken verbatim (see toolLoop's speakAndPause); everything else ends the task.
  private agentOutcomeToResult(outcome: AgentOutcome): ToolResult {
    if (outcome.kind === "ask" || outcome.kind === "confirm") {
      const spoken = outcome.kind === "ask" ? outcome.question : outcome.prompt;
      return { ok: true, message: "Paused — waiting for the user's reply.", data: { speakAndPause: spoken } };
    }
    this.activeAgent = undefined;
    this.agentDevice = undefined;
    // The summary is planner prose that may paraphrase page/file text — keep it short before it re-enters the main model's
    // context (tools there stay gated either way).
    const brief = (t: string) => t.replace(/[\u0000-\u001f]+/g, " ").slice(0, 400);
    if (outcome.kind === "done") return { ok: true, message: brief(outcome.summary) };
    if (outcome.kind === "failed") return { ok: false, message: brief(outcome.reason) };
    return { ok: false, message: "Stopped." };
  }

  private async handleServerTool(name: string, args: unknown, sourceMessageId?: string): Promise<ToolResult> {
    const messages = getMessages(this.language);
    if (name === "pc_task") return this.startAgent(args);
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
    // No point waiting out a full tool timeout for a client that already disconnected.
    if (this.ws.readyState !== this.ws.OPEN) {
      return Promise.resolve({ ok: false, message: getMessages(this.language).deviceDisconnected });
    }
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
                // Resolve first: nothing after this may throw before the waiting turn is released.
                resolve(result);
                db.toolInvocation
                  .update({
                    where: { id: invocation.id },
                    data: { status: result.ok ? "success" : "error", result: result as object, completedAt: new Date() },
                  })
                  .catch(() => {});
              },
            });

            this.send({ type: "tool_call", callId, name, args });
          })
      )
      // A DB hiccup creating the audit row used to reject here, leaving the assistant message with
      // unanswered tool_calls in history — which the LLM API rejects on every following turn of the
      // connection. Always answer the call.
      .catch((err) => {
        console.error("[session] dispatchToolCall failed", err);
        return { ok: false, message: getMessages(this.language).turnFailedGeneric };
      });
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
