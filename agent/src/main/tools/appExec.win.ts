import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Fixed argv passed to execFile — never a raw interpolated string passed to
// exec(). `start` launches and returns immediately rather than waiting for
// the opened app to exit, which is exactly the behavior needed here.
export async function winOpenApp(openCommand: string): Promise<boolean> {
  try {
    await execFileAsync("cmd.exe", ["/c", "start", "", openCommand]);
    return true;
  } catch {
    return false;
  }
}

export async function winCloseApp(processName: string): Promise<boolean> {
  try {
    await execFileAsync("taskkill", ["/IM", processName, "/F"]);
    return true;
  } catch {
    return false;
  }
}
