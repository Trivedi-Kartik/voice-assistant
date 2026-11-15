import { atspiAvailable, runAtspi, type HelperResult } from "./atspi.js";
import { runUia } from "./uia.js";

// One accessibility entry point for the rest of the agent. Linux = AT-SPI (python helper), Windows = UI Automation
// (PowerShell helper); both speak the same JSON protocol, so ui.ts doesn't care which one it is talking to.
export function runA11y(request: Record<string, unknown>, timeoutMs?: number): Promise<HelperResult> {
  if (process.platform === "win32") return runUia(request, timeoutMs);
  if (process.platform === "linux") return runAtspi(request, timeoutMs);
  return Promise.resolve({ ok: false, error: "unsupported", detail: "Reading app windows isn't available on this system." });
}

let winAvailable: boolean | null = null;
export async function a11yAvailable(): Promise<boolean> {
  if (process.platform === "linux") return atspiAvailable();
  if (process.platform === "win32") {
    winAvailable ??= (await runUia({ cmd: "windows" }, 15_000)).ok === true;
    return winAvailable;
  }
  return false;
}

export const MISSING_A11Y_HINT =
  process.platform === "win32"
    ? "Reading app windows needs Windows UI Automation, which didn't load."
    : "Reading app windows needs the accessibility library (sudo apt install python3-gi gir1.2-atspi-2.0).";
