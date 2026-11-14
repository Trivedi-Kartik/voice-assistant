import { v4 as uuid } from "uuid";
import type { ServerMessage, AutomationAction } from "../protocol.js";
import { decideNextAction, type AutomationHistoryEntry } from "./vision.js";
import { db } from "../db.js";

const MAX_STEPS = 15; // hard cap — a misdecided loop can't run forever, mirrors MAX_TOOL_LOOP_STEPS in ws/session.ts
const TASK_TIMEOUT_MS = 3 * 60 * 1000; // wall-clock cap, independent of step count
// Per-wait caps. The wall-clock cap above is only checked between steps, so without these a
// device that crashes/disconnects/stops answering would leave runTurn() awaiting forever —
// holding the per-user turn lock (every later turn: "turn in progress") until a server restart.
export const OBSERVATION_TIMEOUT_MS = 45_000; // client captures + uploads a screenshot
export const ACTION_RESULT_TIMEOUT_MS = 30_000; // client performs one click/type/key/scroll

export type AutomationOutcome =
  | { kind: "done"; summary: string }
  | { kind: "needs_confirmation"; description: string };

// One in-flight computer-use task. Lives on Session.activeAutomation for the
// task's whole lifetime, which can span multiple user turns whenever a
// high-risk step needs a fresh spoken confirmation — see ws/session.ts for how
// each such confirmation mints its own self-contained tool_calls/tool history
// pair rather than leaving one call "open" across turns (the same lesson
// already learned the hard way for the simpler single-shot confirmations).
export class AutomationRunner {
  readonly id: string;
  readonly goal: string;
  private stepIndex = 0;
  private readonly startedAt = Date.now();
  private readonly history: AutomationHistoryEntry[] = [];
  private pendingAction?: AutomationAction;
  private cancelled = false;
  // Set when the task is ended by something other than the user saying stop (the device went
  // away or stopped responding) — only changes the spoken summary.
  private abortReason?: "disconnected" | "unresponsive";
  private waitObservation?: (screenshot: string) => void;
  private waitActionResult?: (result: { ok: boolean; message: string }) => void;

  constructor(
    private readonly userId: string,
    private readonly deviceId: string,
    goal: string,
    private readonly apiKey: string,
    private readonly send: (msg: ServerMessage) => void
  ) {
    this.id = uuid();
    this.goal = goal;
  }

  handleObservation(taskId: string, screenshot: string): void {
    if (taskId !== this.id) return;
    this.waitObservation?.(screenshot);
    this.waitObservation = undefined;
  }

  handleActionResult(taskId: string, ok: boolean, message: string): void {
    if (taskId !== this.id) return;
    this.waitActionResult?.({ ok, message });
    this.waitActionResult = undefined;
  }

  handleCancel(taskId: string): void {
    if (taskId !== this.id) return;
    this.cancelled = true;
  }

  // Ends the task from the server side (device disconnected) and releases whatever the loop is
  // currently waiting on, so the awaiting runTurn() can finish and free the user's turn lock.
  abort(reason: "disconnected" | "unresponsive" = "disconnected"): void {
    this.cancelled = true;
    this.abortReason ??= reason;
    this.waitObservation?.("");
    this.waitObservation = undefined;
    this.waitActionResult?.({ ok: false, message: "device unavailable" });
    this.waitActionResult = undefined;
  }

  private nextObservation(): Promise<string> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.abort("unresponsive"), OBSERVATION_TIMEOUT_MS);
      this.waitObservation = (screenshot) => {
        clearTimeout(timer);
        resolve(screenshot);
      };
    });
  }

  private nextActionResult(): Promise<{ ok: boolean; message: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.abort("unresponsive"), ACTION_RESULT_TIMEOUT_MS);
      this.waitActionResult = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
    });
  }

  private stoppedOutcome(): AutomationOutcome {
    this.send({ type: "automation_stop", taskId: this.id });
    const summary =
      this.abortReason === "disconnected"
        ? "Stopped — the connection to your device was lost."
        : this.abortReason === "unresponsive"
          ? "Stopped — your device stopped responding."
          : "Stopped by the user.";
    return { kind: "done", summary };
  }

  // "start": first call, right after the user confirmed launching automation.
  // "resume-confirmed": user said yes to a specific risky step — execute it.
  // "resume-cancelled": user said no — end the whole task, not just that step
  // (a simple, unambiguous default: no per-step skip-and-continue option).
  async run(mode: "start" | "resume-confirmed" | "resume-cancelled"): Promise<AutomationOutcome> {
    if (mode === "resume-cancelled") {
      this.send({ type: "automation_stop", taskId: this.id });
      return { kind: "done", summary: "Stopped — that step wasn't confirmed." };
    }

    let screenshot: string;
    if (mode === "start") {
      this.send({ type: "automation_start", taskId: this.id, goal: this.goal });
      screenshot = await this.nextObservation();
    } else {
      const action = this.pendingAction!;
      this.pendingAction = undefined;
      const early = await this.executeAndRecord(action);
      if (early) return early;
      screenshot = await this.nextObservation();
    }
    return this.loop(screenshot);
  }

  private async loop(screenshot: string): Promise<AutomationOutcome> {
    for (; this.stepIndex < MAX_STEPS; this.stepIndex++) {
      if (this.cancelled) return this.stoppedOutcome();
      if (Date.now() - this.startedAt > TASK_TIMEOUT_MS) {
        this.send({ type: "automation_stop", taskId: this.id });
        return { kind: "done", summary: "Stopped — this was taking too long." };
      }

      const action = await decideNextAction(this.apiKey, this.goal, screenshot, this.history);

      if (action.type === "done") {
        this.send({ type: "automation_stop", taskId: this.id });
        return { kind: "done", summary: `Done — ${action.reasoning}` };
      }
      if (action.type === "failed") {
        this.send({ type: "automation_stop", taskId: this.id });
        return { kind: "done", summary: `Couldn't finish — ${action.reasoning}` };
      }
      if (action.risk === "high") {
        this.pendingAction = action;
        return { kind: "needs_confirmation", description: action.reasoning };
      }

      const early = await this.executeAndRecord(action);
      if (early) return early;
      screenshot = await this.nextObservation();
    }

    this.send({ type: "automation_stop", taskId: this.id });
    return { kind: "done", summary: "Stopped after reaching the step limit without finishing." };
  }

  private async executeAndRecord(action: AutomationAction): Promise<AutomationOutcome | undefined> {
    this.send({ type: "automation_action", taskId: this.id, stepIndex: this.stepIndex, action });
    const result = await this.nextActionResult();
    // Aborted (device gone / unresponsive): the step may never have executed — don't record it as one.
    if (this.abortReason) return this.stoppedOutcome();
    this.history.push({ action, result });
    await this.persistStep(action, result);
    if (this.cancelled) return this.stoppedOutcome();
    return undefined;
  }

  // Best-effort audit trail (same precedent as ToolInvocation) — only ever
  // called for a step that actually executed (a high-risk step only reaches
  // here once confirmed), and never persists screenshot bytes, matching
  // vision/routes.ts's existing choice not to store screen-content data
  // anywhere server-side.
  private async persistStep(action: AutomationAction, result: { ok: boolean; message: string }): Promise<void> {
    await db.automationStep
      .create({
        data: {
          taskId: this.id,
          userId: this.userId,
          deviceId: this.deviceId,
          stepIndex: this.stepIndex,
          action: action as object,
          risk: action.risk,
          confirmed: true,
          resultOk: result.ok,
          resultMessage: result.message,
        },
      })
      .catch((err) => console.error("[automation] persistStep failed", err));
  }
}
