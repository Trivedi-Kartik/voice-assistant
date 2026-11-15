import { a11yAvailable, MISSING_A11Y_HINT, runA11y } from "./a11y/provider.js";
import { isSystemPermissionDialog } from "./guards.js";

// Platform-neutral view of "what's on screen" built from the OS accessibility tree, and the operations on
// it. Elements get short ids (e1, e2…) for the planner; each id maps to the helper's stateless address
// (path + expected role + name) so a stale id is detected instead of acting on the wrong control.

export interface UiNode {
  path: string;
  role: string;
  name: string;
  text?: string;
  flags?: string[];
}

interface Snapshot {
  app: string;
  title: string;
  nodes: (UiNode & { id: string })[];
  truncated: boolean;
}

let last: Snapshot | null = null;

// What the agent itself just opened (app name or file name). On Wayland a freshly launched window often does NOT get
// focus (GNOME's focus-stealing prevention), so "the active window" is still the user's — in testing, observe after
// opening the Calculator read the user's code editor. Default looks go to the agent's own window instead.
let agentWindowHint = "";
export function setAgentWindowHint(hint: string): void {
  agentWindowHint = hint.trim();
}

// Element ids must stay the SAME across looks. The first version numbered elements 1..N per snapshot, so after
// every click the buttons were renumbered and the model clicked the wrong keys (a 12x12 calculator task clicked
// 2,1,C,1…). An element's identity is its address + role + name; once it has been given an id, it keeps it for as
// long as we're looking at the same app. Ids of vanished elements are never reused.
const idByKey = new Map<string, string>();
let nextId = 1;
let idsForApp = "";

function stableId(n: UiNode): string {
  const key = `${n.path}|${n.role}|${n.name}`;
  let id = idByKey.get(key);
  if (!id) {
    id = `e${nextId++}`;
    idByKey.set(key, id);
  }
  return id;
}

const MAX_LINES = 90;
const MAX_CHARS = 3500;

export function formatSnapshot(s: Snapshot): string {
  const lines = [`Window: ${s.title || "(untitled)"} — ${s.app}`];
  let shown = 0;
  for (const n of s.nodes) {
    // Unnamed, non-editable, empty nodes carry nothing the planner could refer to.
    const editable = n.flags?.includes("editable");
    if (!n.name && !n.text && !editable) continue;
    const flags = n.flags?.length ? ` (${n.flags.join(", ")})` : "";
    const value = n.text ? ` = ${JSON.stringify(n.text.slice(0, 160))}` : "";
    lines.push(`[${n.id}] ${n.role}${n.name ? ` ${JSON.stringify(n.name.slice(0, 80))}` : ""}${value}${flags}`);
    if (++shown >= MAX_LINES) {
      lines.push("…(more elements not shown)");
      break;
    }
  }
  if (s.truncated && shown < MAX_LINES) lines.push("…(window has more elements)");
  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…(truncated)` : text;
}

export async function uiAvailable(): Promise<boolean> {
  return a11yAvailable();
}

export async function takeSnapshot(windowQuery = "", framePath?: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (process.platform !== "linux" && process.platform !== "win32") return { ok: false, message: "Reading app windows isn't available on this system yet." };
  let query = windowQuery;
  if (!query && !framePath && agentWindowHint) {
    // Only use the hint if such a window actually exists; otherwise fall back to the active window.
    const w = await runA11y({ cmd: "windows" });
    const hint = agentWindowHint.toLowerCase();
    const has = w.ok && (w.windows as { title: string; app: string }[]).some((x) => x.title && (x.title.toLowerCase().includes(hint) || x.app.toLowerCase().includes(hint)));
    if (has) query = agentWindowHint;
  }
  const r = await runA11y({ cmd: "snapshot", window: query, frame_path: framePath, max_nodes: 300 });
  if (!r.ok) {
    if (r.error === "missing_atspi" || r.error === "missing_uia") return { ok: false, message: MISSING_A11Y_HINT };
    return { ok: false, message: String(r.detail ?? "I couldn't read that window.") };
  }
  const app = String(r.app ?? "");
  if (app !== idsForApp) {
    idByKey.clear();
    nextId = 1;
    idsForApp = app; // a different app: start numbering afresh
  }
  const nodes = (r.nodes as UiNode[]).map((n) => ({ ...n, id: stableId(n) }));
  last = { app, title: String(r.title ?? ""), nodes, truncated: Boolean(r.truncated) };
  return { ok: true, text: formatSnapshot(last) };
}

export type ResolvedElement = { ok: true; node: UiNode & { id: string } } | { ok: false; message: string };

// "e12" -> that element; otherwise match by visible name (exact, then contains) among the last snapshot.
export function resolveElement(ref: string): ResolvedElement {
  if (!last) return { ok: false, message: "I haven't looked at a window yet — use observe first." };
  const key = ref.trim();
  const byId = last.nodes.find((n) => n.id === key);
  if (byId) return { ok: true, node: byId };
  const lower = key.toLowerCase();
  const exact = last.nodes.filter((n) => n.name.toLowerCase() === lower);
  let pool = exact.length ? exact : last.nodes.filter((n) => n.name.toLowerCase().includes(lower) && n.name);
  // A button and a text label often share a name (the Calculator's "=" key and the "=" shown on its display): when
  // names collide, the operable control wins over plain text.
  if (pool.length > 1) {
    const controls = pool.filter((n) => !/^(label|heading|static|paragraph|title bar|status bar)$/.test(n.role));
    if (controls.length >= 1) pool = controls;
  }
  if (pool.length === 1) return { ok: true, node: pool[0] };
  if (pool.length === 0) return { ok: false, message: `No element "${key}" in ${last.title || "the window"}. Use observe and pick an id.` };
  return { ok: false, message: `"${key}" matches ${pool.length} elements (${pool.slice(0, 5).map((n) => `${n.id} ${n.role} "${n.name}"`).join("; ")}). Use an id.` };
}

async function act(node: UiNode, op: string, text?: string): Promise<{ ok: boolean; message: string }> {
  if (last && isSystemPermissionDialog(last.app, last.title)) {
    return { ok: false, message: "That's a system permission or password dialog — only the user can answer it. Ask them to." };
  }
  const r = await runA11y({ cmd: "act", path: node.path, role: node.role, name: node.name, op, text });
  if (r.ok) return { ok: true, message: "" };
  return { ok: false, message: String(r.detail ?? "That didn't work.") };
}

export async function clickElement(ref: string): Promise<{ ok: boolean; message: string }> {
  const el = resolveElement(ref);
  if (!el.ok) return el;
  const r = await act(el.node, "click");
  return r.ok ? { ok: true, message: `Clicked ${el.node.role} "${el.node.name}".` } : r;
}

export async function setElementText(ref: string, text: string): Promise<{ ok: boolean; message: string }> {
  const el = resolveElement(ref);
  if (!el.ok) return el;
  const r = await act(el.node, "set_text", text);
  return r.ok ? { ok: true, message: `Set the text of ${el.node.role} "${el.node.name}".` } : r;
}

// Types into whichever text field currently has keyboard focus (at the caret).
export async function typeIntoFocused(text: string): Promise<{ ok: boolean; message: string }> {
  const f = await runA11y({ cmd: "focused_editable" });
  const el = f.element as { path: string; role: string; name: string } | null | undefined;
  if (!f.ok || !el) return { ok: false, message: "No text field has focus — click one first, or use set_text with an element." };
  const r = await act(el as UiNode, "insert_text", text);
  return r.ok ? { ok: true, message: "Typed the text." } : r;
}

export async function focusWindowByTitle(title: string): Promise<{ ok: boolean; message: string }> {
  const w = await runA11y({ cmd: "windows" });
  if (!w.ok) return { ok: false, message: "I can't see the open windows." };
  const q = title.toLowerCase();
  const win = (w.windows as { path: string; app: string; title: string; active: boolean }[]).find((x) => x.title.toLowerCase().includes(q) || x.app.toLowerCase().includes(q));
  if (!win) return { ok: false, message: `No window titled "${title}" found.` };
  if (win.active) return { ok: true, message: `"${win.title}" is already in front.` };
  const r = await runA11y({ cmd: "act", path: win.path, role: "frame", op: "focus" });
  if (r.ok) return { ok: true, message: `Asked the desktop to focus "${win.title}" (some desktops ignore this).` };
  return { ok: false, message: `Couldn't bring "${win.title}" to the front on this desktop.` };
}

// Closes a window the way a user would: its own Close button (so the app can ask "Save changes?"). Several
// windows can share a title (two documents with the same name); the active one is closed first, and success means
// the number of matching windows dropped — not merely that "a window with that title" is gone or still there.
// If the app put up a dialog instead of closing, say so and show it.
export async function closeWindowByTitle(title: string): Promise<{ ok: boolean; message: string; elements?: string }> {
  const q = title.toLowerCase();
  const matching = async () => {
    const w = await runA11y({ cmd: "windows" });
    if (!w.ok) return undefined;
    return (w.windows as { path: string; title: string; app: string; active: boolean }[]).filter(
      (x) => x.title && (x.title.toLowerCase().includes(q) || x.app.toLowerCase().includes(q))
    );
  };
  const before = await matching();
  if (!before) return { ok: false, message: "I can't see the open windows." };
  if (before.length === 0) return { ok: false, message: `No window titled "${title}" found.` };
  const win = before.find((x) => x.active) ?? before[0];
  if (process.platform === "win32") {
    // WindowPattern.Close() is the same as the title-bar X (the app can still ask to save).
    const c = await runA11y({ cmd: "act", path: win.path, role: "frame", op: "close" });
    if (!c.ok) return { ok: false, message: String(c.detail ?? "Couldn't close that window.") };
  }
  const snap = process.platform === "win32" ? ({ ok: true, text: "" } as const) : await takeSnapshot("", win.path);
  if (!snap.ok) return { ok: false, message: snap.message };
  if (process.platform !== "win32") {
    const closeBtn = last!.nodes.find((n) => /^(close|close window|quit|exit)$/i.test(n.name.trim()) && /button|menu item/.test(n.role));
    if (!closeBtn) return { ok: false, message: `"${win.title}" has no Close button I can press.`, elements: snap.text };
    const r = await act(closeBtn, "click");
    if (!r.ok) return r;
  }
  for (let i = 0; i < 8; i++) {
    await new Promise((res) => setTimeout(res, 500));
    const now = await matching();
    if (now && now.length < before.length) return { ok: true, message: `Closed "${win.title}".` };
  }
  const after = await takeSnapshot("");
  return { ok: false, message: `"${win.title}" is still open — the app may be asking something (e.g. save changes). Look at the window and answer it.`, elements: after.ok ? after.text : undefined };
}

// Simulated keystrokes go to whichever window has keyboard focus — not necessarily the one the agent means. In
// testing, "6*7⏎" and Ctrl+Q aimed at the Calculator went to the user's browser, because two windows (an X11 browser
// and a Wayland app) both claimed to be active. So before typing we require ONE unambiguous focused window that
// matches the window the agent is working in; otherwise refuse and let the planner use click/set_text, which act on
// a specific control regardless of focus.
const PLUMBING_APPS = new Set(["gnome-shell", "gjs", "ibus-x11", "ibus-extension-gtk3", "evolution-alarm-notify", "update-notifier", "xdg-desktop-portal-gnome", "xdg-desktop-portal-gtk"]);

export async function keyboardTargetCheck(intended?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const target = (intended || last?.title || "").trim();
  if (!target) return { ok: false, message: "I haven't looked at the window I'd be typing into — use observe (or name the window) first." };
  const w = await runA11y({ cmd: "windows" });
  if (!w.ok) return { ok: false, message: "I can't see which window has the keyboard, so I won't type blindly. Use click/set_text instead." };
  const actives = (w.windows as { title: string; app: string; active: boolean }[]).filter((x) => x.active && x.title && !PLUMBING_APPS.has(x.app));
  if (actives.length !== 1) {
    return { ok: false, message: `I can't tell which window has the keyboard (${actives.map((x) => `"${x.title}"`).join(", ") || "none"}), so I won't type blindly. Use click/set_text on the element instead.` };
  }
  const t = target.toLowerCase();
  if (!actives[0].title.toLowerCase().includes(t) && !t.includes(actives[0].title.toLowerCase())) {
    return { ok: false, message: `The keyboard is in "${actives[0].title}", not "${target}" — I won't type into a window the user may be using. Bring the right window to the front, or use click/set_text.` };
  }
  return { ok: true };
}

export async function listWindows(): Promise<{ title: string; app: string; active: boolean }[]> {
  if (process.platform !== "linux" && process.platform !== "win32") return [];
  const w = await runA11y({ cmd: "windows" });
  return w.ok ? (w.windows as { title: string; app: string; active: boolean }[]).filter((x) => x.title) : [];
}
