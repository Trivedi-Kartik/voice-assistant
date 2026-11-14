import type { ToolSchema } from "../tools/schemas.js";

// The action space the planner chooses from — one function call per step.
//
// Kept deliberately COMPACT: every planner call re-sends these schemas, and the shared free Groq key is
// capped at 8,000 tokens/minute. The first version (21 verbose tools + an `expect` block on each) cost
// ~3,560 tokens per call, i.e. ~2 calls/minute, which showed up as ~30 s of rate-limit waiting per step.
// Related operations are grouped (file.op, clipboard.op) and the planner maps them back to the internal
// action names below, so the runner, safety gate and desktop client are unaffected.

type Props = ToolSchema["function"]["parameters"]["properties"];
const fn = (name: string, description: string, properties: Props = {}, required: string[] = []): ToolSchema => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });

export const AGENT_ACTION_SCHEMAS: ToolSchema[] = [
  fn(
    "file",
    "Files in the user's home (paths like ~/Desktop/a.txt). op: read | write | list (a folder) | move | copy | delete (to Trash) | open (in its default app). " +
      "write mode: create | append | overwrite. Prefer this over typing into editors.",
    {
      op: s("Operation", { enum: ["read", "write", "list", "move", "copy", "delete", "open"] }),
      path: s("Path (source for move/copy)"),
      to: s("Destination for move/copy"),
      content: s("Text for write"),
      mode: s("For write", { enum: ["create", "append", "overwrite"] }),
    },
    ["op", "path"]
  ),
  fn("open_app", "Launch an app by name (notepad, chrome, calculator…).", { app: s("App name") }, ["app"]),
  fn("open_url", "Open an http(s) URL in the browser.", { url: s("URL") }, ["url"]),
  fn("clipboard", "Read or write the clipboard.", { op: s("read | write", { enum: ["read", "write"] }), text: s("Text for write") }, ["op"]),
  fn("wait", "Wait for something to load.", { seconds: { type: "number", description: "1-10" } }, ["seconds"]),
  fn("focus_window", "Bring a window to the front by title.", { title: s("Title or part of it") }, ["title"]),
  fn("click", "Click a UI element (id from the observation, or its name).", { element: s("Element id or name"), double: { type: "boolean", description: "Double-click" } }, ["element"]),
  fn("set_text", "Set the text of an input field.", { element: s("Element id or name"), text: s("Text") }, ["element", "text"]),
  fn("type_text", "Type text where the keyboard focus is.", { text: s("Text") }, ["text"]),
  fn("hotkey", "Press keys, e.g. [\"ctrl\",\"s\"] or [\"enter\"].", { keys: { type: "array", description: "Keys" } }, ["keys"]),
  fn("observe", "Look at the current state again."),
  fn("ask_user", "Ask the user one short question (pauses until they answer).", { question: s("Question in the user's language") }, ["question"]),
  fn("done", "The goal is achieved.", { summary: s("1-2 spoken sentences in the user's language") }, ["summary"]),
  fn("fail", "The goal can't be achieved.", { reason: s("Short spoken reason in the user's language") }, ["reason"]),
];

// Internal action names understood by the runner, safety gate and desktop client.
export const AGENT_ACTION_NAMES = new Set([
  "file_read", "file_write", "file_list", "file_move", "file_copy", "file_delete", "file_open",
  "open_app", "open_url", "clipboard_read", "clipboard_write", "wait",
  "focus_window", "click", "set_text", "type_text", "hotkey", "observe",
  "ask_user", "done", "fail",
]);
export const META_ACTIONS = new Set(["ask_user", "done", "fail"]);

// Maps a compact planner call to the internal action name + args.
export function toInternalAction(name: string, args: Record<string, unknown>): { name: string; args: Record<string, unknown> } {
  if (name === "file" || name === "clipboard") {
    const { op, ...rest } = args;
    return { name: `${name}_${typeof op === "string" ? op : "?"}`, args: rest };
  }
  return { name, args };
}
