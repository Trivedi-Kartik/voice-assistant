import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Runs atspi_helper.py (Linux accessibility). The source is read with fs and passed via `python3 -c`, so it
// works from inside the packaged app.asar (python3 itself can't read files from an asar archive).
function helperSource(): string {
  const candidates = [
    path.join(__dirname, "atspi_helper.py"), // dist/ (copied by scripts/copy-assets.js at build) — also inside app.asar
    path.join(__dirname, "../../../../src/main/agent/a11y/atspi_helper.py"), // dist -> src fallback (dev, `tsc -w`)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  throw new Error("atspi_helper.py not found");
}

let cachedSource: string | null = null;

export interface HelperResult {
  ok: boolean;
  error?: string;
  detail?: string;
  [k: string]: unknown;
}

export async function runAtspi(request: Record<string, unknown>, timeoutMs = 15_000): Promise<HelperResult> {
  cachedSource ??= helperSource();
  try {
    const { stdout } = await execFileAsync("python3", ["-c", cachedSource, JSON.stringify(request)], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout) as HelperResult;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, error: "no_python", detail: "python3 isn't installed." };
    return { ok: false, error: "helper_failed", detail: String((err as Error).message).slice(0, 200) };
  }
}

let available: boolean | null = null;
export async function atspiAvailable(): Promise<boolean> {
  if (available !== null) return available;
  const r = await runAtspi({ cmd: "windows" }, 8000);
  available = r.ok === true;
  return available;
}
