import { db } from "../db.js";

// Phase 1 slice 2 (docs/IMPLEMENTATION_ROADMAP.md) — "just start recording
// what already happens," no behavior change. Every call here is meant to be
// used fire-and-forget from ws/session.ts (`.catch(...)`), same precedent as
// memory/conversationStore.ts's appendMessage — a write failure here must
// never affect the live turn.

export type TaskStatus = "completed" | "paused" | "failed";
export type TaskStepKind = "tool_call" | "server_tool" | "automation" | "confirmation_gate" | "assistant_text";

export interface TaskStepInput {
  kind: TaskStepKind;
  toolName?: string;
  resultOk?: boolean;
  resultMessage?: string;
}

// One Task per Session.runTurn() call. `goal` is best-effort context (the
// turn's transcript) for later readability, not something anything branches
// on.
export async function createTask(
  userId: string,
  deviceId: string,
  conversationId: string,
  goal?: string
): Promise<string> {
  const task = await db.task.create({ data: { userId, deviceId, conversationId, goal } });
  return task.id;
}

export async function appendTaskStep(taskId: string, stepIndex: number, step: TaskStepInput): Promise<void> {
  await db.taskStep.create({
    data: {
      taskId,
      stepIndex,
      kind: step.kind,
      toolName: step.toolName,
      resultOk: step.resultOk,
      resultMessage: step.resultMessage,
    },
  });
}

export async function completeTask(taskId: string, status: TaskStatus): Promise<void> {
  await db.task.update({ where: { id: taskId }, data: { status, completedAt: new Date() } });
}
