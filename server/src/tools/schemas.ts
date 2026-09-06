import { TOOL_NAMES } from "./toolNames.js";

// Shared shape for both client-executed (GROQ_TOOL_SCHEMAS) and server-handled
// (SERVER_TOOL_SCHEMAS) tools — lets llm.ts accept either/both without TS
// inferring two incompatible literal array types from separate object literals.
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

// Tool schemas offered to the Groq tool-calling LLM. Names MUST exactly match
// agent/src/shared/toolContract.ts (kept in sync by hand, see toolNames.ts) and the
// client's tool registry (agent/src/main/tools/index.ts) — the LLM only ever picks
// from this fixed, typed set, never a raw command string. See docs/ARCHITECTURE.md.
export const GROQ_TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function" as const,
    function: {
      name: "open_app",
      description: "Open a whitelisted desktop application by name.",
      parameters: {
        type: "object",
        properties: {
          app: {
            type: "string",
            description: "The app name, e.g. 'chrome', 'camera', 'file explorer', 'spotify', 'task manager'.",
          },
        },
        required: ["app"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "close_app",
      description:
        "Close a running whitelisted desktop application by name. Not every app that can be opened can be " +
        "closed this way (e.g. File Explorer never can, since force-closing it takes down the whole desktop) " +
        "— the tool result will say so if it can't.",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", description: "The app name, e.g. 'chrome', 'spotify', 'task manager'." },
        },
        required: ["app"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for a query in the user's default browser.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_url",
      description: "Open a specific URL in the user's default browser.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "A fully-qualified http(s) URL." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "control_media",
      description: "Control whatever media is currently playing on the user's machine (works regardless of which app has focus).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The media control action to perform.",
            enum: ["play_pause", "next", "previous", "stop", "volume_up", "volume_down", "mute"],
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_reminder",
      description:
        "Set a reminder that fires after a relative delay (not an absolute time-of-day — always ask 'in how many " +
        "minutes/hours' if the user gives a time like '6pm' rather than a duration).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind the user about." },
          delayMinutes: {
            type: "integer",
            description: "How many minutes from now to fire the reminder (1 to 10080, i.e. up to 7 days).",
          },
        },
        required: ["text", "delayMinutes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_clipboard",
      description:
        "Read the user's current clipboard contents so you can act on or discuss them. This always asks the " +
        "user to confirm first, since clipboard contents can be sensitive.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "take_screenshot_and_describe",
      description:
        "Take a screenshot of the user's primary screen and describe what's on it. Always asks the user to " +
        "confirm first, since this shares whatever is currently visible on their screen.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_custom_app",
      description:
        "Let the user add a new app to the ones they can open/close by name. Opens a file picker for the " +
        "user to choose the real program — always asks the user to confirm first, and the user still has to " +
        "pick the actual file themselves; this never adds anything without them physically selecting it.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "What the user wants to call this app, e.g. 'photoshop'." },
        },
        required: ["name"],
      },
    },
  },
];

// Server-handled tools (Phase 2) — these never round-trip to the client at all,
// unlike GROQ_TOOL_SCHEMAS above. They don't touch the user's OS, so there's
// nothing for a device to "implement" — always offered regardless of
// Device.capabilities. See ws/session.ts for where these get dispatched
// differently from client tools.
export const SERVER_TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function" as const,
    function: {
      name: "remember_preference",
      description:
        "Save a durable fact or preference about the user for future conversations (e.g. " +
        "'prefers Chrome over Edge', 'lives in Ahmedabad'). Only call this when the user " +
        "states something clearly worth remembering long-term — not for one-off requests " +
        "or small talk.",
      parameters: {
        type: "object",
        properties: {
          fact: {
            type: "string",
            description: "The fact to remember, written in third person, e.g. 'Prefers searching in Chrome.'",
          },
        },
        required: ["fact"],
      },
    },
  },
];

export const SERVER_TOOL_NAMES = new Set(SERVER_TOOL_SCHEMAS.map((s) => s.function.name));

// Computer-use automation — a screenshot -> decide-action -> execute loop that
// can click/type/scroll anywhere on screen (see server/src/automation/). Kept
// out of GROQ_TOOL_SCHEMAS/TOOL_NAMES deliberately: unlike every other client
// tool, this one never resolves via a single dispatchToolCall/tool_result
// round-trip through the client's plain tool REGISTRY — its execution is a
// bounded multi-step WS conversation of its own (see ws/session.ts,
// automation/runner.ts), so it has no place in the registry-schema symmetry
// check that assertSchemasMatchContract() enforces for the other 9.
export const AUTOMATION_TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function" as const,
    function: {
      name: "computer_use_task",
      description:
        "Use ONLY when a request needs clicking/typing inside an app or website beyond what the other tools " +
        "cover (e.g. 'add this to my cart on Amazon', 'send a WhatsApp message to X saying Y'). Takes " +
        "screenshots and controls the mouse/keyboard step by step toward the goal. Always asks the user to " +
        "confirm first, and again before any step that submits a purchase, sends a message, or deletes " +
        "something. Can misclick sometimes — describe the goal precisely.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "A precise, complete description of what to accomplish on screen." },
        },
        required: ["goal"],
      },
    },
  },
];

// The server-side replacement for what each tool's client-side describe()
// used to do for the deleted dialog.showMessageBox gate — these tools now get
// a spoken confirmation question (see ws/session.ts) instead of a popup.
// Presence in this map, not a "sensitivity" field, is what makes a tool call
// pause for confirmation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONFIRMATION_PROMPTS: Partial<Record<string, (args: any) => string>> = {
  close_app: (args) => `Close ${args?.app ?? "that"}? Say yes to confirm.`,
  read_clipboard: () => "Share your clipboard with me? Say yes to confirm.",
  take_screenshot_and_describe: () => "Take a screenshot and share it with me? Say yes to confirm.",
  add_custom_app: (args) => `Add ${args?.name ?? "that"} as an app you can open? Say yes to confirm.`,
  computer_use_task: () =>
    "This lets me click and type on your screen to do that — it can sometimes click the wrong thing, and " +
    "you can say stop at any point. Go ahead?",
};

function assertSchemasMatchContract() {
  const schemaNames = GROQ_TOOL_SCHEMAS.map((s) => s.function.name).sort();
  const contractNames = [...TOOL_NAMES].sort();
  const matches =
    schemaNames.length === contractNames.length && schemaNames.every((n, i) => n === contractNames[i]);
  if (!matches) {
    throw new Error(
      `Tool schema/name drift: server schemas [${schemaNames}] vs shared contract [${contractNames}]`
    );
  }
}
assertSchemasMatchContract();

// Filters the full schema set down to what a specific device actually implements
// (Device.capabilities) — keeps the "server only knows names/schemas, client
// hardcodes execution" boundary intact across platforms with different tool support.
export function toolSchemasForCapabilities(capabilities: string[]) {
  return GROQ_TOOL_SCHEMAS.filter((s) => capabilities.includes(s.function.name));
}
