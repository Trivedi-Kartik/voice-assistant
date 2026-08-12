import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Deliberately spawn(), not execFile() — execFile's promise only resolves
// when the child process EXITS, which is correct for a short-lived command
// like taskkill/pkill but wrong for launching a long-running GUI app: it
// would hang the tool call for as long as the launched app stays open.
// Windows avoids this by shelling out through `start`, which launches and
// returns immediately; spawn(..., { detached: true }).unref() is the
// direct equivalent — fire-and-forget, not waiting for exit.
//
// The one thing that needs recovering some other way: whether the binary
// even exists. spawn's "error" event (ENOENT) fires quickly if it doesn't
// — race a short window for it rather than silently reporting success.
export function linuxOpenApp(openCommand: string, args: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(openCommand, args, { detached: true, stdio: "ignore" });
    child.once("error", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.unref();
        resolve(true);
      }
    }, 250);
  });
}

// pkill is short-lived (not a launched GUI app), so execFile's
// wait-for-exit behavior is exactly right here, same as taskkill on
// Windows. -x for exact-name matching (mirrors taskkill /IM's exact
// semantics); -i for case-insensitivity, since Linux process names aren't
// as predictably-cased as Windows' *.exe convention (documented caveat:
// the kernel truncates process `comm` names to 15 characters, which can
// affect exact matching for longer binary names — a known limitation, not
// something engineered around here).
export async function linuxCloseApp(processName: string): Promise<boolean> {
  try {
    await execFileAsync("pkill", ["-x", "-i", processName]);
    return true;
  } catch {
    return false;
  }
}
