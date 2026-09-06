import type { AutomationAction } from "../../../shared/protocol.js";
import { performActionWindows } from "./inputSim.win.js";
import { performActionLinux } from "./inputSim.linux.js";

// "done"/"failed" carry nothing to execute — the caller (automation/
// automationRunner.ts) never sends these as an automation_action in the
// first place, but this stays total for safety.
export async function performAction(action: AutomationAction): Promise<{ ok: boolean; message: string }> {
  if (action.type === "done" || action.type === "failed") {
    return { ok: true, message: action.reasoning };
  }
  return process.platform === "win32" ? performActionWindows(action) : performActionLinux(action);
}
