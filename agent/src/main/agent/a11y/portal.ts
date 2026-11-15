import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// Wayland keyboard input through the xdg-desktop-portal RemoteDesktop portal (portal_helper.py). The user approves once
// in a system dialog; the restore token is saved so later sessions start silently (0.1 s, measured). If the user
// declines, we don't ask again for a while — the agent falls back to accessibility instead of nagging.

function helperSource(): string {
  for (const c of [path.join(__dirname, "portal_helper.py"), path.join(__dirname, "../../../../src/main/agent/a11y/portal_helper.py")]) {
    if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  }
  throw new Error("portal_helper.py not found");
}

function tokenFile(): string {
  return process.env.KARVIX_PORTAL_TOKEN_FILE || path.join(app.getPath("userData"), "portal-token");
}

const START_TIMEOUT_MS = 85_000; // the user may need a moment to read the dialog; the device act timeout is 90 s
const CALL_TIMEOUT_MS = 20_000;
const DECLINE_COOLDOWN_MS = 10 * 60_000;

let proc: ChildProcessWithoutNullStreams | null = null;
let started = false;
let declinedAt = 0;
let queue: Promise<unknown> = Promise.resolve();
let pending: ((line: string) => void) | null = null;

function spawnHelper(): void {
  proc = spawn("python3", ["-c", helperSource()], { stdio: ["pipe", "pipe", "pipe"] });
  const rl = readline.createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    const p = pending;
    pending = null;
    p?.(line);
  });
  proc.on("exit", () => {
    proc = null;
    started = false;
    pending?.('{"ok":false,"error":"helper_exited"}');
    pending = null;
  });
}

function call(req: Record<string, unknown>, timeoutMs: number): Promise<{ ok: boolean; error?: string; detail?: string; restore_token?: string }> {
  // One request at a time over the pipe.
  const run = async () => {
    if (!proc) spawnHelper();
    return new Promise<{ ok: boolean; error?: string; detail?: string; restore_token?: string }>((resolve) => {
      const timer = setTimeout(() => {
        pending = null;
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);
      pending = (line) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false, error: "bad_reply" });
        }
      };
      proc!.stdin.write(JSON.stringify(req) + "\n");
    });
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

async function ensureStarted(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (started && proc) return { ok: true };
  if (Date.now() - declinedAt < DECLINE_COOLDOWN_MS) return { ok: false, message: "Keyboard control was declined in the system dialog." };
  let token = "";
  try {
    token = fs.readFileSync(tokenFile(), "utf8").trim();
  } catch {
    /* first use: the desktop will ask the user */
  }
  const r = await call({ cmd: "start", restore_token: token }, START_TIMEOUT_MS);
  if (!r.ok) {
    if (r.error === "denied") declinedAt = Date.now();
    proc?.kill();
    return { ok: false, message: r.error === "denied" ? "Keyboard control was declined in the system dialog." : r.error === "timeout" ? "The keyboard-control permission dialog wasn't answered." : "Keyboard control isn't available on this desktop." };
  }
  started = true;
  if (r.restore_token) {
    try {
      fs.writeFileSync(tokenFile(), r.restore_token, { mode: 0o600 }); // restore tokens are single-use: keep the newest
    } catch {
      /* non-fatal: we'll just ask again next launch */
    }
  }
  return { ok: true };
}

export async function portalKeys(keys: string[]): Promise<{ ok: boolean; message: string }> {
  const s = await ensureStarted();
  if (!s.ok) return s;
  const r = await call({ cmd: "keys", keys }, CALL_TIMEOUT_MS);
  return r.ok ? { ok: true, message: `Pressed ${keys.join("+")}.` } : { ok: false, message: `Couldn't press ${keys.join("+")} (${r.detail ?? r.error}).` };
}

export async function portalType(text: string): Promise<{ ok: boolean; message: string }> {
  const s = await ensureStarted();
  if (!s.ok) return s;
  const r = await call({ cmd: "text", text }, CALL_TIMEOUT_MS + text.length * 30);
  return r.ok ? { ok: true, message: "Typed the text." } : { ok: false, message: `Couldn't type (${r.detail ?? r.error}).` };
}

export function stopPortal(): void {
  proc?.kill();
  proc = null;
  started = false;
}
