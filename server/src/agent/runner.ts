import { v4 as uuid } from "uuid";
import type { ChatMessage } from "../llm.js";
import { AGENT_ACTION_NAMES } from "./actions.js";
import { classifyAction } from "./safety.js";
import { buildAgentSystemPrompt, type Planner } from "./planner.js";
import type { ActionResult, AgentAction, AgentDevice, AgentOutcome, AgentStatus, Observation } from "./types.js";

export const AGENT_LIMITS = {
  maxSteps: 40,
  timeoutMs: 10 * 60_000,
  maxConsecutiveFailures: 4,
  keepRecentSteps: 14, // older step messages are dropped from the planner context (pairs kept intact)
  maxObservationChars: 6000,
  maxDataChars: 4000,
};

export function formatObservation(o: Observation | undefined, max = AGENT_LIMITS.maxObservationChars): string {
  if (!o) return "(no observation available)";
  const lines: string[] = [];
  if (o.activeWindow) lines.push(`Active window: ${o.activeWindow.title}${o.activeWindow.app ? ` (${o.activeWindow.app})` : ""}`);
  if (o.windows?.length) lines.push(`Open windows: ${o.windows.map((w) => w.title).filter(Boolean).slice(0, 25).join(" | ")}`);
  if (o.notes?.length) lines.push(...o.notes);
  if (o.elements) lines.push("UI elements:", o.elements);
  const text = lines.join("\n") || "(nothing observed)";
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

function describe(action: AgentAction): string {
  const a = action.args;
  const v = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  switch (action.name) {
    case "file_write": return `Writing ${v("path")}`;
    case "file_read": return `Reading ${v("path")}`;
    case "file_list": return `Looking in ${v("path")}`;
    case "file_mkdir": return `Creating folder ${v("path")}`;
    case "file_open": return `Opening ${v("path")}`;
    case "file_move": return `Moving ${v("from")}`;
    case "file_copy": return `Copying ${v("from")}`;
    case "file_delete": return `Deleting ${v("path")}`;
    case "open_app": return `Opening ${v("app")}`;
    case "open_url": return `Opening ${v("url")}`;
    case "click": return `Clicking ${v("element")}`;
    case "set_text":
    case "type_text": return "Typing";
    case "hotkey": return `Pressing ${Array.isArray(a.keys) ? a.keys.join("+") : ""}`;
    case "focus_window": return `Switching to ${v("title")}`;
    case "wait": return "Waiting";
    default: return action.name.replace(/_/g, " ");
  }
}

type Pending =
  | { type: "ask"; toolCallId: string }
  | { type: "confirm"; toolCallId: string; action: AgentAction };

export interface AgentRunnerOptions {
  id?: string;
  goal: string;
  language: string;
  device: AgentDevice;
  planner: Planner;
  onStatus?: (s: AgentStatus) => void;
  limits?: Partial<typeof AGENT_LIMITS>;
  now?: () => number;
}

// One multi-step PC task. Can span several voice turns: it pauses (returns "ask"/"confirm") and is
// resumed with the user's next answer. Every path ends in done/failed/cancelled.
export class AgentRunner {
  readonly id: string;
  readonly goal: string;
  private readonly limits: typeof AGENT_LIMITS;
  private readonly now: () => number;
  private messages: ChatMessage[] = [];
  private steps = 0;
  private consecutiveFailures = 0;
  private nudged = false;
  private startedAt = 0;
  private cancelled = false;
  private pending?: Pending;

  constructor(private readonly opts: AgentRunnerOptions) {
    this.id = opts.id ?? uuid();
    this.goal = opts.goal;
    this.limits = { ...AGENT_LIMITS, ...opts.limits };
    this.now = opts.now ?? Date.now;
  }

  get waiting(): "ask" | "confirm" | undefined {
    return this.pending?.type;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async start(): Promise<AgentOutcome> {
    this.startedAt = this.now();
    this.opts.onStatus?.({ state: "started", goal: this.goal });
    const observation = await this.opts.device.observe().catch(() => undefined);
    this.messages = [
      { role: "system", content: buildAgentSystemPrompt(this.opts.language, observation?.platform) },
      { role: "user", content: `Goal: ${this.goal}\n\nCurrent state:\n${formatObservation(observation)}` },
    ];
    return this.loop();
  }

  async resumeWithAnswer(answer: string): Promise<AgentOutcome> {
    const p = this.pending;
    if (!p || p.type !== "ask") return this.loop();
    this.pending = undefined;
    this.push({ role: "tool", tool_call_id: p.toolCallId, content: JSON.stringify({ ok: true, userAnswer: answer }) });
    return this.loop();
  }

  async resumeWithConfirmation(yes: boolean): Promise<AgentOutcome> {
    const p = this.pending;
    if (!p || p.type !== "confirm") return this.loop();
    this.pending = undefined;
    if (!yes) {
      this.push({ role: "tool", tool_call_id: p.toolCallId, content: JSON.stringify({ ok: false, message: "The user said NO. Do not do this, and do not ask them to confirm it again. Unless the rest of the goal can still be done without it, call done now and tell them it was not done." }) });
      return this.loop();
    }
    const outcome = await this.execute({ ...p.action, confirmed: true }, p.toolCallId);
    return outcome ?? this.loop();
  }

  private end(outcome: AgentOutcome): AgentOutcome {
    this.opts.onStatus?.({ state: "ended", ok: outcome.kind === "done", text: outcome.kind === "done" ? outcome.summary : outcome.kind === "failed" ? outcome.reason : undefined });
    return outcome;
  }

  private push(m: ChatMessage): void {
    this.messages.push(m);
    // Bound the context: keep system + goal, drop the oldest assistant/tool pairs beyond the window.
    const head = 2;
    const maxBody = this.limits.keepRecentSteps * 2;
    while (this.messages.length - head > maxBody && this.messages[head]?.role === "assistant") {
      const drop = this.messages[head + 1]?.role === "tool" ? 2 : 1;
      this.messages.splice(head, drop);
    }
  }

  private async loop(): Promise<AgentOutcome> {
    for (;;) {
      if (this.cancelled) return this.end({ kind: "cancelled" });
      if (this.steps >= this.limits.maxSteps) return this.end({ kind: "failed", reason: "That took more steps than I'm allowed, so I stopped. Try breaking it into smaller requests." });
      if (this.now() - this.startedAt > this.limits.timeoutMs) return this.end({ kind: "failed", reason: "That was taking too long, so I stopped." });

      let decision;
      try {
        decision = await this.opts.planner.next(this.messages);
      } catch (err) {
        console.error("[agent] planner failed", err);
        return this.end({ kind: "failed", reason: "I couldn't work out the next step right now. Please try again." });
      }
      if (this.cancelled) return this.end({ kind: "cancelled" });

      if (decision.kind === "text") {
        // The model answered in prose instead of calling a function: nudge once, then accept it as the summary.
        if (!this.nudged && decision.assistant.content.trim()) {
          this.nudged = true;
          this.push(decision.assistant);
          this.push({ role: "user", content: "Reply by calling exactly one function (use done if the goal is complete)." });
          continue;
        }
        return this.end({ kind: "done", summary: decision.assistant.content.trim() || "Done." });
      }

      this.steps++;
      const { action, toolCallId } = decision;
      this.push(decision.assistant);

      if (!AGENT_ACTION_NAMES.has(action.name)) {
        this.push({ role: "tool", tool_call_id: toolCallId, content: JSON.stringify({ ok: false, message: `Unknown action "${action.name}".` }) });
        continue;
      }
      const text = (k: string) => (typeof action.args[k] === "string" ? (action.args[k] as string) : "");
      if (action.name === "done") return this.end({ kind: "done", summary: text("summary") || "Done." });
      if (action.name === "fail") return this.end({ kind: "failed", reason: text("reason") || "I couldn't do that." });
      if (action.name === "ask_user") {
        this.pending = { type: "ask", toolCallId };
        this.opts.onStatus?.({ state: "waiting", text: text("question") });
        return { kind: "ask", question: text("question") || "Could you tell me a bit more?" };
      }

      const safety = classifyAction(action);
      if (safety.level === "block") {
        this.push({ role: "tool", tool_call_id: toolCallId, content: JSON.stringify({ ok: false, message: safety.reason }) });
        continue;
      }
      if (safety.level === "confirm") {
        this.pending = { type: "confirm", toolCallId, action };
        this.opts.onStatus?.({ state: "waiting", text: safety.prompt });
        return { kind: "confirm", prompt: safety.prompt };
      }

      const outcome = await this.execute(action, toolCallId);
      if (outcome) return outcome;
    }
  }

  // Runs one action on the device, verifies it, records the result for the planner. Returns an
  // outcome only when the task must pause or stop.
  private async execute(action: AgentAction, toolCallId: string): Promise<AgentOutcome | undefined> {
    this.opts.onStatus?.({ state: "step", text: describe(action) });
    let result: ActionResult;
    try {
      result = await this.opts.device.act(action);
    } catch (err) {
      result = { ok: false, message: `The computer didn't respond (${(err as Error).message}).` };
    }
    if (this.cancelled) return this.end({ kind: "cancelled" });

    if (result.needsConfirmation && !action.confirmed) {
      this.pending = { type: "confirm", toolCallId, action };
      this.opts.onStatus?.({ state: "waiting", text: result.needsConfirmation.prompt });
      return { kind: "confirm", prompt: result.needsConfirmation.prompt };
    }

    if (result.ok && action.expect && Object.keys(action.expect).length > 0) {
      const v = await this.opts.device.verify(action.expect).catch(() => ({ ok: true, detail: "verification unavailable" }));
      if (!v.ok) result = { ...result, ok: false, message: `The action ran, but the check failed: ${v.detail}` };
    }

    this.consecutiveFailures = result.ok ? 0 : this.consecutiveFailures + 1;
    this.opts.onStatus?.({ state: "step", text: result.message, ok: result.ok });

    const dataText = result.data === undefined ? undefined : JSON.stringify(result.data);
    this.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: JSON.stringify({
        ok: result.ok,
        message: result.message,
        ...(dataText ? { data: dataText.length > this.limits.maxDataChars ? `${dataText.slice(0, this.limits.maxDataChars)}…(truncated)` : dataText } : {}),
        ...(result.observation ? { state: formatObservation(result.observation) } : {}),
      }),
    });

    if (this.consecutiveFailures >= this.limits.maxConsecutiveFailures) {
      return this.end({ kind: "failed", reason: "I kept running into problems with that, so I stopped. " + result.message });
    }
    return undefined;
  }
}
