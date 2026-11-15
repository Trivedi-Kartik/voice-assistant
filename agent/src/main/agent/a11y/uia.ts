import { app } from "electron";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { HelperResult } from "./atspi.js";

const execFileAsync = promisify(execFile);

// Windows accessibility via uia_helper.ps1. powershell.exe can't read a script out of app.asar, so the script is written
// once to the app's data folder (rewritten when it changes) and run with -File. ExecutionPolicy is bypassed for THIS
// process only (our own file) — nothing about the system's policy is changed.
let scriptPath: string | null = null;

function ensureScript(): string {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  let source: string | null = null;
  for (const c of [path.join(__dirname, "uia_helper.ps1"), path.join(__dirname, "../../../../src/main/agent/a11y/uia_helper.ps1")]) {
    if (fs.existsSync(c)) {
      source = fs.readFileSync(c, "utf8");
      break;
    }
  }
  if (!source) throw new Error("uia_helper.ps1 not found");
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const dir = path.join(app.getPath("userData"), "helpers");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `uia_helper.${hash}.ps1`);
  // UTF-8 with BOM: Windows PowerShell 5.1 reads BOM-less files as ANSI and would garble non-ASCII text.
  if (!fs.existsSync(file)) fs.writeFileSync(file, "﻿" + source, "utf8");
  scriptPath = file;
  return file;
}

export async function runUia(request: Record<string, unknown>, timeoutMs = 20_000): Promise<HelperResult> {
  try {
    const file = ensureScript();
    const b64 = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file, "-Request", b64],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
    );
    return JSON.parse(stdout.trim().replace(/^﻿/, "")) as HelperResult;
  } catch (err) {
    return { ok: false, error: "helper_failed", detail: String((err as Error).message).slice(0, 200) };
  }
}
