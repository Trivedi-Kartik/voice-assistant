import { clipboard, shell } from "electron";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { dispatchToolCall } from "../tools/index.js";
import { displayPath, resolveUserPath, PathError } from "./paths.js";
import type { AgentActionWire } from "../../shared/protocol.js";

export interface AgentActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
  needsConfirmation?: { prompt: string };
}

const MAX_READ_BYTES = 200 * 1024;
const str = (v: unknown) => (typeof v === "string" ? v : "");

// Deterministic skills (plan §3, route A). Every handler validates its own inputs; paths go through
// resolveUserPath (home-only, no hidden files). Destructive operations re-check confirmation HERE too,
// so even a buggy/compromised server can't delete or overwrite without the user's yes.
export const SKILLS: Record<string, (a: AgentActionWire) => Promise<AgentActionResult>> = {
  async file_read(a) {
    const p = resolveUserPath(str(a.args.path));
    const stat = await fs.stat(p);
    if (stat.isDirectory()) return { ok: false, message: `${displayPath(p)} is a folder — use file_list.` };
    if (stat.size > MAX_READ_BYTES) return { ok: false, message: `${displayPath(p)} is too large to read (${Math.round(stat.size / 1024)} KB).` };
    const content = await fs.readFile(p, "utf8");
    return { ok: true, message: `Read ${displayPath(p)} (${content.length} characters).`, data: { content } };
  },

  async file_write(a) {
    const p = resolveUserPath(str(a.args.path));
    const content = str(a.args.content);
    const mode = str(a.args.mode) || "create";
    const exists = existsSync(p);
    if (exists && (await fs.stat(p)).isDirectory()) return { ok: false, message: `${displayPath(p)} is a folder.` };
    await fs.mkdir(path.dirname(p), { recursive: true });
    if (mode === "append") {
      // Start the new text on its own line when the file doesn't already end with one.
      let prefix = "";
      if (exists) {
        const current = await fs.readFile(p, "utf8");
        if (current.length > 0 && !current.endsWith("\n")) prefix = "\n";
      }
      await fs.appendFile(p, prefix + content, "utf8");
      return { ok: true, message: `Added text to ${displayPath(p)}.` };
    }
    if (mode === "create" && exists) return { ok: false, message: `${displayPath(p)} already exists — use append, or overwrite to replace it.` };
    if (mode === "overwrite" && exists && !a.confirmed) {
      return { ok: false, message: "Needs confirmation.", needsConfirmation: { prompt: `Replace everything in ${displayPath(p)}? Say yes to confirm.` } };
    }
    await fs.writeFile(p, content, "utf8");
    return { ok: true, message: `${exists ? "Replaced" : "Created"} ${displayPath(p)}.` };
  },

  async file_list(a) {
    const p = resolveUserPath(str(a.args.path) || "~");
    const entries = await fs.readdir(p, { withFileTypes: true });
    const visible = entries.filter((e) => !e.name.startsWith(".")).slice(0, 300);
    const list = visible.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    return { ok: true, message: `${displayPath(p)} has ${list.length} item(s).`, data: { entries: list } };
  },

  async file_mkdir(a) {
    const p = resolveUserPath(str(a.args.path));
    if (existsSync(p)) return (await fs.stat(p)).isDirectory() ? { ok: true, message: `${displayPath(p)} already exists.` } : { ok: false, message: `A file named ${displayPath(p)} already exists.` };
    await fs.mkdir(p, { recursive: true });
    return { ok: true, message: `Created folder ${displayPath(p)}.` };
  },

  async file_move(a) {
    const from = resolveUserPath(str(a.args.from));
    let to = resolveUserPath(str(a.args.to));
    if (existsSync(to) && (await fs.stat(to)).isDirectory()) to = path.join(to, path.basename(from));
    if (existsSync(to)) return { ok: false, message: `${displayPath(to)} already exists.` };
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    return { ok: true, message: `Moved to ${displayPath(to)}.` };
  },

  async file_copy(a) {
    const from = resolveUserPath(str(a.args.from));
    let to = resolveUserPath(str(a.args.to));
    if (existsSync(to) && (await fs.stat(to)).isDirectory()) to = path.join(to, path.basename(from));
    if (existsSync(to)) return { ok: false, message: `${displayPath(to)} already exists.` };
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    return { ok: true, message: `Copied to ${displayPath(to)}.` };
  },

  async file_delete(a) {
    const p = resolveUserPath(str(a.args.path));
    if (!existsSync(p)) return { ok: false, message: `${displayPath(p)} doesn't exist.` };
    if (!a.confirmed) return { ok: false, message: "Needs confirmation.", needsConfirmation: { prompt: `Move ${displayPath(p)} to the Trash? Say yes to confirm.` } };
    await shell.trashItem(p); // recoverable from the Trash/Recycle Bin — never a permanent delete
    return { ok: true, message: `Moved ${displayPath(p)} to the Trash.` };
  },

  async file_open(a) {
    const p = resolveUserPath(str(a.args.path));
    if (!existsSync(p)) return { ok: false, message: `${displayPath(p)} doesn't exist.` };
    const err = await shell.openPath(p);
    return err ? { ok: false, message: `Couldn't open it: ${err}` } : { ok: true, message: `Opened ${displayPath(p)}.` };
  },

  // Reuse the existing, already-hardened tools (app whitelist/registry, http(s)-only URLs).
  async open_app(a) {
    return dispatchToolCall("open_app", { app: str(a.args.app) });
  },
  async open_url(a) {
    return dispatchToolCall("open_url", { url: str(a.args.url) });
  },

  async clipboard_read() {
    const text = clipboard.readText();
    return { ok: true, message: text ? `Clipboard has ${text.length} characters.` : "The clipboard is empty.", data: { text: text.slice(0, 20_000) } };
  },
  async clipboard_write(a) {
    clipboard.writeText(str(a.args.text));
    return { ok: true, message: "Copied to the clipboard." };
  },

  async wait(a) {
    const seconds = Math.max(0.5, Math.min(10, Number(a.args.seconds) || 1));
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return { ok: true, message: `Waited ${seconds}s.` };
  },
};

export function skillErrorMessage(err: unknown): string {
  if (err instanceof PathError) return err.message;
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "That file or folder doesn't exist.";
  if (code === "EACCES" || code === "EPERM") return "I don't have permission to do that.";
  if (code === "EEXIST") return "Something with that name already exists.";
  return (err as Error)?.message ?? "That didn't work.";
}
