import fs from "node:fs";
import type { BrowserWindow } from "electron";
import type { AgentActionWire, AgentExpectationWire, ClientMessage, ServerMessage } from "../../shared/protocol.js";
import { SKILLS, skillErrorMessage, type AgentActionResult } from "./skills.js";
import { observe, observeUi, runUiAction } from "./desktop.js";
import { resolveUserPath } from "./paths.js";
import { isRiskyShortcut, isSystemPermissionDialog, isTerminalWindow } from "./guards.js";
import { webAction } from "./browser/browser.js";

// Device side of the Karvix 2 PC agent: answers the server's agent_request (observe / act / verify) and
// mirrors agent_status into the existing "automation" panel (goal + live steps + Stop).
//
// Defense in depth: the client re-checks risky actions itself (skills.ts demands confirmation for
// delete/overwrite; click/type on risky or secret fields is refused here) regardless of what the server
// asked for.

const UI_ACTIONS = new Set(["focus_window", "close_window", "click", "set_text", "type_text", "hotkey"]);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const SECRET_FIELD = /\b(password|passcode|pin|otp|cvv|cvc|card number)\b/i;

type Send = (msg: ClientMessage) => void;

let activeTaskId: string | null = null;
let panelVisible = false;
let currentGoal = "";

async function act(a: AgentActionWire): Promise<AgentActionResult> {
  if ((a.name === "type_text" || a.name === "set_text") && SECRET_FIELD.test(String(a.args.element ?? ""))) {
    return { ok: false, message: "I won't type into password or payment fields — please do that yourself." };
  }
  // Everything that synthesizes keyboard or mouse input. These checks run on the DEVICE whatever the server decided, and
  // they fail CLOSED: if we can't tell what is in front, we don't type.
  const INPUT_ACTIONS = new Set(["type_text", "hotkey", "set_text", "screen_click"]);
  if (INPUT_ACTIONS.has(a.name)) {
    if ((a.name === "type_text" || a.name === "hotkey") && !str(a.args.window).trim()) {
      return { ok: false, message: "Say which window to type into (use observe, then pass its title) — I won't type blindly." };
    }
    let front: { app?: string; title?: string } | undefined;
    try {
      front = (await observe()).activeWindow;
    } catch {
      return { ok: false, message: "I can't tell which window is in front, so I won't send keystrokes or clicks." };
    }
    // A terminal would run what's typed; a permission/password dialog would let the agent grant itself access.
    if (isTerminalWindow(front?.app, front?.title)) {
      return { ok: false, message: "A terminal is in front, and I never type into terminals (a newline would run a command). Use the file skills instead." };
    }
    if (isSystemPermissionDialog(front?.app, front?.title)) {
      return { ok: false, message: "A system permission or password dialog is in front — only the user can answer it. Ask them to." };
    }
  }
  // Shortcuts that close windows, quit apps or open system menus need the user's yes (the server also asks; this is the re-check).
  if (a.name === "hotkey" && !a.confirmed) {
    const keys = Array.isArray(a.args.keys) ? a.args.keys.map(String) : [];
    if (isRiskyShortcut(keys)) {
      return { ok: false, message: "Needs confirmation.", needsConfirmation: { prompt: `Press ${keys.join("+")}? That can close windows or open system menus. Say yes to confirm.`, kind: "shortcut", target: keys.join("+") } };
    }
  }
  const skill = SKILLS[a.name];
  try {
    if (skill) return await skill(a);
    if (a.name.startsWith("web_")) return await webAction(a);
    if (UI_ACTIONS.has(a.name)) return await runUiAction(a);
    if (a.name === "observe") return await observeUi();
    return { ok: false, message: `Unknown action "${a.name}".` };
  } catch (err) {
    return { ok: false, message: skillErrorMessage(err) };
  }
}

async function verify(e: AgentExpectationWire): Promise<{ ok: boolean; detail: string }> {
  try {
    if (e.fileExists !== undefined) {
      const p = resolveUserPath(e.fileExists);
      if (!fs.existsSync(p)) return { ok: false, detail: `${e.fileExists} does not exist` };
    }
    if (e.fileContains) {
      const p = resolveUserPath(e.fileContains.path);
      const content = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      if (!content.includes(e.fileContains.text)) return { ok: false, detail: `${e.fileContains.path} does not contain "${e.fileContains.text}"` };
    }
    if (e.windowTitleContains) {
      const o = await observe();
      const titles = [o.activeWindow?.title ?? "", ...(o.windows ?? []).map((w) => w.title)];
      // Only fail when we actually could see windows; on Wayland there's nothing to compare against.
      if ((o.activeWindow || o.windows?.length) && !titles.some((t) => t.toLowerCase().includes(e.windowTitleContains!.toLowerCase()))) {
        return { ok: false, detail: `no window titled "${e.windowTitleContains}"` };
      }
    }
    return { ok: true, detail: "ok" };
  } catch (err) {
    return { ok: false, detail: skillErrorMessage(err) };
  }
}

export async function handleAgentRequest(msg: Extract<ServerMessage, { type: "agent_request" }>, send: Send): Promise<void> {
  activeTaskId = msg.taskId;
  let result: unknown;
  if (msg.kind === "observe") result = await observe();
  else if (msg.kind === "verify") result = await verify(msg.expect ?? {});
  else if (msg.action) result = await act(msg.action);
  else result = { ok: false, message: "No action given." };
  send({ type: "agent_response", taskId: msg.taskId, requestId: msg.requestId, result });
}

export function handleAgentStatus(msg: Extract<ServerMessage, { type: "agent_status" }>, win: BrowserWindow): void {
  const show = () => {
    if (!panelVisible) win.webContents.send("conversation:automationStart", { goal: currentGoal });
    panelVisible = true;
  };
  const hide = () => {
    if (panelVisible) win.webContents.send("conversation:automationStop", {});
    panelVisible = false;
  };
  switch (msg.state) {
    case "started":
      activeTaskId = msg.taskId;
      currentGoal = msg.goal ?? "";
      show();
      return;
    case "step":
      activeTaskId = msg.taskId;
      show();
      win.webContents.send("conversation:automationStep", { action: { risk: "low", reasoning: msg.text ?? "" }, ok: msg.ok ?? true, message: msg.text ?? "" });
      return;
    case "waiting":
      // Hide the panel while the agent waits for the user, so the hotkey/mic starts listening for the answer
      // instead of meaning "stop the task".
      hide();
      return;
    case "ended":
      activeTaskId = null;
      hide();
      return;
  }
}

// Stop button / hotkey while the panel is up.
export function cancelActiveAgentTask(send: Send, win?: BrowserWindow): boolean {
  if (!activeTaskId) return false;
  send({ type: "agent_cancel", taskId: activeTaskId });
  activeTaskId = null;
  if (panelVisible && win) win.webContents.send("conversation:automationStop", {});
  panelVisible = false;
  return true;
}

// Connection lost: the server-side task is gone too.
export function resetAgentTask(win: BrowserWindow): void {
  activeTaskId = null;
  if (panelVisible) win.webContents.send("conversation:automationStop", {});
  panelVisible = false;
}
