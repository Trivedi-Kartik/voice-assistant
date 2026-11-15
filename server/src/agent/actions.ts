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

// Vision CLICKING is OFF unless VISION_CLICK_ENABLED=1. Measured on a synthetic screen with known button positions
// (2026-11-15): of the answers the model gave, 1 of 3 landed inside the button; misses were 77 px and 348 px off a
// 96x66 button — and on the real run the "7" click landed between other keys. A wrong click in someone's real apps is
// harm, so the planner is only offered `look` (describing the screen, which is reliable) until accuracy is proven.
export const VISION_CLICK_ENABLED = process.env.VISION_CLICK_ENABLED === "1";

function screenAction(): ToolSchema {
  const ops = VISION_CLICK_ENABLED ? ["look", "click"] : ["look"];
  return fn(
    "screen",
    VISION_CLICK_ENABLED
      ? "LAST RESORT for apps whose controls you can't see in observe: look = describe the screen; click = click the thing you describe (e.g. \"the green Play button\"; unreliable — check with look). The user is asked once per task before screen use."
      : "LAST RESORT: look = have the screen described to you (read-only; you can't click by sight). Use when observe shows no usable controls. The user is asked once per task before screen use.",
    { op: s("Operation", { enum: ops }), ...(VISION_CLICK_ENABLED ? { target: s("For click: what to click, described as a person would") } : {}) },
    ["op"]
  );
}

export const AGENT_ACTION_SCHEMAS: ToolSchema[] = [
  fn(
    "file",
    "Files in the user's home (paths like ~/Desktop/a.txt). op: read | write | list (a folder) | mkdir (new folder) | move | copy | delete (to Trash) | open (in its default app). " +
      "write mode: create | append | overwrite. Prefer this over typing into editors.",
    {
      op: s("Operation", { enum: ["read", "write", "list", "mkdir", "move", "copy", "delete", "open"] }),
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
  fn(
    "system",
    "Read or change a computer setting. value: 'get', a number 0-100, 'up'/'down', 'mute'/'unmute', or 'on'/'off'.",
    {
      setting: s("Setting", { enum: ["volume", "brightness", "dark_mode", "do_not_disturb", "wifi", "bluetooth", "lock_screen"] }),
      value: s("get | 0-100 | up | down | mute | unmute | on | off"),
    },
    ["setting", "value"]
  ),
  fn(
    "web",
    "Use the web in the user's dedicated browser (preferred for websites, shopping, forms). ops: open(url) | observe | click(element) | fill(element,text) " +
      "| press(key) | scroll(direction) | back | read | close. Elements come as [w12] ids from the page listing. The user types passwords/payment " +
      "details themselves — never fill those; ask them. You may add to cart and go through checkout, but the final Place order/Pay/Send click needs the user's yes (automatic).",
    {
      op: s("Operation", { enum: ["open", "observe", "click", "fill", "press", "scroll", "back", "read", "close"] }),
      url: s("For open"),
      element: s("Element id like w12, or its exact visible name"),
      text: s("For fill (a select's option label; 'false' unticks a checkbox)"),
      key: s("For press, e.g. Enter"),
      direction: s("For scroll", { enum: ["down", "up"] }),
    },
    ["op"]
  ),
  screenAction(),
  fn("focus_window", "Bring a window to the front by title.", { title: s("Title or part of it") }, ["title"]),
  fn("close_window", "Close a window like the user would (its Close button). Succeeds only once it is really gone; if the app asks to save, you must answer that.", { title: s("Title or part of it") }, ["title"]),
  fn("click", "Click a UI element (id from the observation, or its name).", { element: s("Element id or name"), double: { type: "boolean", description: "Double-click" } }, ["element"]),
  fn("set_text", "Set the text of an input field.", { element: s("Element id or name"), text: s("Text") }, ["element", "text"]),
  fn("type_text", "Type text into the window that has the keyboard (refused if that isn't clearly the window you mean — then use set_text).", { text: s("Text"), window: s("Title of the window you mean") }, ["text", "window"]),
  fn("hotkey", "Press keys, e.g. [\"ctrl\",\"s\"] or [\"enter\"], in the window you name.", { keys: { type: "array", description: "Keys" }, window: s("Title of the window you mean") }, ["keys", "window"]),
  fn("observe", "Look at the current state again."),
  fn("ask_user", "Ask the user one short question (pauses until they answer).", { question: s("Question in the user's language") }, ["question"]),
  fn("done", "The goal is achieved.", { summary: s("1-2 spoken sentences in the user's language") }, ["summary"]),
  fn("fail", "The goal can't be achieved.", { reason: s("Short spoken reason in the user's language") }, ["reason"]),
];

// Internal action names understood by the runner, safety gate and desktop client.
export const AGENT_ACTION_NAMES = new Set([
  "file_read", "file_write", "file_list", "file_mkdir", "file_move", "file_copy", "file_delete", "file_open",
  "screen_look", "screen_click", "web_open", "web_observe", "web_click", "web_fill", "web_press", "web_scroll", "web_back", "web_read", "web_close",
  "open_app", "open_url", "clipboard_read", "clipboard_write", "wait", "system_setting",
  "focus_window", "close_window", "click", "set_text", "type_text", "hotkey", "observe",
  "ask_user", "done", "fail",
]);
export const META_ACTIONS = new Set(["ask_user", "done", "fail"]);

// Maps a compact planner call to the internal action name + args.
export function toInternalAction(name: string, args: Record<string, unknown>): { name: string; args: Record<string, unknown> } {
  if (name === "system") return { name: "system_setting", args };
  if (name === "screen") {
    const { op, ...rest } = args;
    return { name: `screen_${typeof op === "string" ? op : "?"}`, args: rest };
  }
  if (name === "web") {
    const { op, ...rest } = args;
    return { name: `web_${typeof op === "string" ? op : "?"}`, args: rest };
  }
  if (name === "file" || name === "clipboard") {
    const { op, ...rest } = args;
    const internal = `${name}_${typeof op === "string" ? op : "?"}`;
    // The compact schema uses `path` as the source; the move/copy skills take `from`/`to`.
    if ((internal === "file_move" || internal === "file_copy") && rest.from === undefined) {
      const { path, ...others } = rest;
      return { name: internal, args: { ...others, from: path } };
    }
    return { name: internal, args: rest };
  }
  return { name, args };
}
