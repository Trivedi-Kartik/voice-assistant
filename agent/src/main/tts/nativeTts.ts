import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Linux-only fallback: Electron/Chromium's Web Speech API has no real TTS
// backend wired up on Linux builds (getVoices() comes back empty, speak() is a
// silent no-op) even when the OS-level speech-dispatcher/espeak-ng stack works
// fine — confirmed live: text appeared in chat, `spd-say "test"` worked, but
// window.speechSynthesis.speak() produced no audio. Shell out to the
// already-confirmed-working `spd-say` instead. Fixed argv, no shell
// interpolation — same pattern as appExec.linux.ts.
let current: ChildProcess | null = null;

export function speakNative(text: string, language: string): Promise<void> {
  return new Promise((resolve) => {
    // espeak-ng (speech-dispatcher's backend) already ships broad language
    // coverage out of the box — just needs -l with the target ISO code, same
    // codes used everywhere else (see server/src/i18n/languages.ts).
    current = spawn("spd-say", ["-l", language, "-w", text], { stdio: "ignore" });
    current.once("exit", () => {
      current = null;
      resolve();
    });
    current.once("error", () => {
      current = null;
      resolve();
    });
  });
}

export async function stopNative(): Promise<void> {
  current = null;
  try {
    await execFileAsync("spd-say", ["-C"]);
  } catch {
    // best-effort — nothing to stop, or speech-dispatcher isn't running
  }
}
