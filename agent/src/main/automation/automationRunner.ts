import type { BrowserWindow } from "electron";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";
import { captureScreenshotDataUri } from "../tools/computerUse/screenshotStep.js";
import { performAction } from "../tools/computerUse/inputSim.js";

// One in-flight computer-use task at a time — same single-Session-per-connection
// assumption as the rest of this client. Tracked here (not in the renderer
// store) since screenshot capture/input simulation only exist in the main
// process, same boundary as every other tool.
let activeTaskId: string | null = null;

export function isAutomationActive(): boolean {
  return activeTaskId !== null;
}

// Wired to the same hotkey/mic-button press used to end a normal session —
// "one control, one meaning: stop" (see renderer/App.tsx).
export function requestCancelActiveAutomation(send: (msg: ClientMessage) => void): void {
  if (activeTaskId) send({ type: "automation_cancel", taskId: activeTaskId });
}

async function captureOrBail(taskId: string, send: (msg: ClientMessage) => void, win: BrowserWindow): Promise<string | null> {
  try {
    return await captureScreenshotDataUri();
  } catch (err) {
    console.error("[automation] screenshot capture failed", err);
    send({ type: "automation_cancel", taskId });
    activeTaskId = null;
    win.webContents.send("conversation:automationStop", {});
    return null;
  }
}

// Handles the 3 automation ServerMessage variants — returns false for
// anything else so index.ts's switch can fall through to its existing cases.
export async function handleAutomationServerMessage(
  msg: ServerMessage,
  send: (msg: ClientMessage) => void,
  win: BrowserWindow
): Promise<boolean> {
  if (msg.type === "automation_start") {
    activeTaskId = msg.taskId;
    win.webContents.send("conversation:automationStart", { goal: msg.goal });
    const screenshot = await captureOrBail(msg.taskId, send, win);
    if (screenshot === null) return true;
    send({ type: "automation_observation", taskId: msg.taskId, stepIndex: 0, screenshot });
    return true;
  }

  if (msg.type === "automation_action") {
    if (msg.taskId !== activeTaskId) return true; // stale/unknown task — ignore
    const result = await performAction(msg.action);
    win.webContents.send("conversation:automationStep", { action: msg.action, ok: result.ok, message: result.message });
    send({ type: "automation_action_result", taskId: msg.taskId, stepIndex: msg.stepIndex, result });
    const screenshot = await captureOrBail(msg.taskId, send, win);
    if (screenshot === null) return true;
    send({ type: "automation_observation", taskId: msg.taskId, stepIndex: msg.stepIndex + 1, screenshot });
    return true;
  }

  if (msg.type === "automation_stop") {
    if (msg.taskId !== activeTaskId) return true;
    activeTaskId = null;
    win.webContents.send("conversation:automationStop", {});
    return true;
  }

  return false;
}
