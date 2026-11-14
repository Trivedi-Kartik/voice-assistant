import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ db: { automationStep: { create: vi.fn(async () => ({})) } } }));
vi.mock("./vision.js", () => ({
  decideNextAction: vi.fn(async () => ({ type: "click", x: 1, y: 2, risk: "low", reasoning: "r" })),
}));

import { AutomationRunner, OBSERVATION_TIMEOUT_MS, ACTION_RESULT_TIMEOUT_MS } from "./runner.js";

const make = () => {
  const sent: { type: string }[] = [];
  const runner = new AutomationRunner("u", "d", "goal", "key", (m) => sent.push(m as { type: string }));
  return { runner, sent };
};

afterEach(() => vi.useRealTimers());

// Regression: these waits used to have no timeout and abort() didn't exist, so a device that
// disconnected mid-task left runTurn() awaiting forever, holding the user's turn lock.
describe("AutomationRunner never waits forever on the device", () => {
  it("abort() releases a run waiting for the first screenshot", async () => {
    const { runner, sent } = make();
    const outcome = runner.run("start");
    await Promise.resolve();
    runner.abort("disconnected");
    await expect(outcome).resolves.toEqual({ kind: "done", summary: "Stopped — the connection to your device was lost." });
    expect(sent.map((m) => m.type)).toContain("automation_stop");
  });

  it("times out when the device never sends the first screenshot", async () => {
    vi.useFakeTimers();
    const { runner } = make();
    const outcome = runner.run("start");
    await vi.advanceTimersByTimeAsync(OBSERVATION_TIMEOUT_MS + 1);
    await expect(outcome).resolves.toEqual({ kind: "done", summary: "Stopped — your device stopped responding." });
  });

  it("times out when the device never reports an action's result, and does not record that step", async () => {
    vi.useFakeTimers();
    const { runner } = make();
    const outcome = runner.run("start");
    await Promise.resolve();
    runner.handleObservation(runner.id, "shot"); // first screenshot arrives -> model picks an action
    await vi.advanceTimersByTimeAsync(ACTION_RESULT_TIMEOUT_MS + 1);
    await expect(outcome).resolves.toMatchObject({ kind: "done", summary: "Stopped — your device stopped responding." });
    const { db } = await import("../db.js");
    expect(db.automationStep.create).not.toHaveBeenCalled();
  });

  it("a user stop still reports 'Stopped by the user.'", async () => {
    const { runner } = make();
    const outcome = runner.run("start");
    await Promise.resolve();
    runner.handleCancel(runner.id);
    runner.handleObservation(runner.id, "shot");
    await expect(outcome).resolves.toEqual({ kind: "done", summary: "Stopped by the user." });
  });
});
