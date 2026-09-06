import type { BrowserWindow } from "electron";
import type { ClientMessage, ServerMessage, AutomationAction } from "../../shared/protocol.js";
import { captureScreenshotDataUri } from "../tools/computerUse/screenshotStep.js";
import { performAction } from "../tools/computerUse/inputSim.js";

// One in-flight computer-use task at a time — same single-Session-per-connection
// assumption as the rest of this client. Tracked here (not in the renderer
// store) since screenshot capture/input simulation only exist in the main
// process, same boundary as every other tool.
let activeTaskId: string | null = null;
// The scale factor of the MOST RECENTLY SENT screenshot (see
// screenshotStep.ts) — the vision model's next decided action is always
// relative to that exact screenshot, so this must be applied to its x/y
// before executing, or every click lands wrong (found via live testing:
// clicks were landing near the top-left of the real screen, e.g. on taskbar
// icons, instead of inside the target window).
let currentScale = 1;

export function isAutomationActive(): boolean {
  return activeTaskId !== null;
}

// Wired to the same hotkey/mic-button press used to end a normal session —
// "one control, one meaning: stop" (see renderer/App.tsx).
export function requestCancelActiveAutomation(send: (msg: ClientMessage) => void): void {
  if (activeTaskId) send({ type: "automation_cancel", taskId: activeTaskId });
}

function scaleAction(action: AutomationAction, scale: number): AutomationAction {
  if (scale === 1) return action;
  return {
    ...action,
    x: action.x !== undefined ? action.x * scale : undefined,
    y: action.y !== undefined ? action.y * scale : undefined,
  };
}

async function captureOrBail(taskId: string, send: (msg: ClientMessage) => void, win: BrowserWindow): Promise<string | null> {
  try {
    const { dataUri, scale } = await captureScreenshotDataUri();
    currentScale = scale;
    return dataUri;
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
    currentScale = 1;
    win.webContents.send("conversation:automationStart", { goal: msg.goal });
    const screenshot = await captureOrBail(msg.taskId, send, win);
    if (screenshot === null) return true;
    send({ type: "automation_observation", taskId: msg.taskId, stepIndex: 0, screenshot });
    return true;
  }

  if (msg.type === "automation_action") {
    if (msg.taskId !== activeTaskId) return true; // stale/unknown task — ignore
    const result = await performAction(scaleAction(msg.action, currentScale));
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
