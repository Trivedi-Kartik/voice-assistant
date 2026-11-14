import type { ToolSchema } from "./schemas.js";
import type { ToolResult } from "../protocol.js";

// Phase 2 (Tool Fabric) — see docs/IMPLEMENTATION_ROADMAP.md and
// docs/TARGET_ARCHITECTURE.md §4. This is the single canonical list every
// export in schemas.ts (GROQ_TOOL_SCHEMAS/SERVER_TOOL_SCHEMAS/
// AUTOMATION_TOOL_SCHEMAS/SERVER_TOOL_NAMES/CONFIRMATION_PROMPTS) is now
// derived from, instead of being hand-written separately in 3 arrays + 1 map.
// Formalizes two signals that were previously only implicit: which array a
// tool sat in (now `kind`) and whether it was a key in CONFIRMATION_PROMPTS
// (now `riskLevel`/`confirmationPrompt`).

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ToolKind = "client" | "server" | "automation";

export interface ToolDefinition {
  id: string;
  description: string;
  inputSchema: ToolSchema["function"]["parameters"];
  kind: ToolKind;
  riskLevel: RiskLevel;
  // Plain tags describing what the tool actually touches today — not the
  // master doc's PermissionRequirement[], which is referenced there but never
  // defined anywhere in this repo or that doc.
  permissions: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmationPrompt?: (args: any) => string;
  // Reserved for Phase 5 (TARGET_ARCHITECTURE.md's own outcome-verifier
  // phase) — deliberately undefined for every tool below. No verification
  // logic exists anywhere in this repo yet, so implementing one now would
  // not be "zero behavior change."
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verify?: (args: any, result: ToolResult) => Promise<{ ok: boolean; message: string }>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: "open_app",
    description: "Open a whitelisted desktop application by name.",
    kind: "client",
    riskLevel: "low",
    permissions: ["process-launch"],
    inputSchema: {
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
  {
    id: "close_app",
    description:
      "Close a running whitelisted desktop application by name. Not every app that can be opened can be " +
      "closed this way (e.g. File Explorer never can, since force-closing it takes down the whole desktop) " +
      "— the tool result will say so if it can't.",
    kind: "client",
    riskLevel: "medium",
    permissions: ["process-control"],
    confirmationPrompt: (args) => `Close ${args?.app ?? "that"}? Say yes to confirm.`,
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string", description: "The app name, e.g. 'chrome', 'spotify', 'task manager'." },
      },
      required: ["app"],
    },
  },
  {
    id: "web_search",
    description: "Search the web for a query in the user's default browser.",
    kind: "client",
    riskLevel: "low",
    permissions: ["network"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
      },
      required: ["query"],
    },
  },
  {
    id: "open_url",
    description: "Open a specific URL in the user's default browser.",
    kind: "client",
    riskLevel: "low",
    permissions: ["network", "process-launch"],
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "A fully-qualified http(s) URL." },
      },
      required: ["url"],
    },
  },
  {
    id: "control_media",
    description: "Control whatever media is currently playing on the user's machine (works regardless of which app has focus).",
    kind: "client",
    riskLevel: "low",
    permissions: ["os-control"],
    inputSchema: {
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
  {
    id: "set_reminder",
    description:
      "Set a reminder that fires after a relative delay (not an absolute time-of-day — always ask 'in how many " +
      "minutes/hours' if the user gives a time like '6pm' rather than a duration).",
    kind: "client",
    riskLevel: "low",
    permissions: [],
    inputSchema: {
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
  {
    id: "read_clipboard",
    description:
      "Read the user's current clipboard contents so you can act on or discuss them. This always asks the " +
      "user to confirm first, since clipboard contents can be sensitive.",
    kind: "client",
    riskLevel: "medium",
    permissions: ["clipboard-read"],
    confirmationPrompt: () => "Share your clipboard with me? Say yes to confirm.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    id: "take_screenshot_and_describe",
    description:
      "Take a screenshot of the user's primary screen and describe what's on it. Always asks the user to " +
      "confirm first, since this shares whatever is currently visible on their screen.",
    kind: "client",
    riskLevel: "medium",
    permissions: ["screen-capture", "network"],
    confirmationPrompt: () => "Take a screenshot and share it with me? Say yes to confirm.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    id: "add_custom_app",
    description:
      "Let the user add a new app to the ones they can open/close by name. Opens a file picker for the " +
      "user to choose the real program — always asks the user to confirm first, and the user still has to " +
      "pick the actual file themselves; this never adds anything without them physically selecting it.",
    kind: "client",
    riskLevel: "medium",
    permissions: ["filesystem"],
    confirmationPrompt: (args) => `Add ${args?.name ?? "that"} as an app you can open? Say yes to confirm.`,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "What the user wants to call this app, e.g. 'photoshop'." },
      },
      required: ["name"],
    },
  },
  {
    id: "remember_preference",
    description:
      "Save a durable fact or preference about the user for future conversations (e.g. " +
      "'prefers Chrome over Edge', 'lives in Ahmedabad'). Only call this when the user " +
      "states something clearly worth remembering long-term — not for one-off requests " +
      "or small talk.",
    kind: "server",
    riskLevel: "low",
    permissions: ["memory-write"],
    inputSchema: {
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
  {
    id: "computer_use_task",
    description:
      "Use ONLY when a request needs clicking/typing inside an app or website beyond what the other tools " +
      "cover (e.g. 'add this to my cart on Amazon', 'send a WhatsApp message to X saying Y'). Call this " +
      "immediately when the request is clear enough — do NOT ask the user in your own words whether to " +
      "proceed first; the system already asks its own confirmation as soon as you call this, so asking " +
      "yourself first only makes the user confirm twice. Takes screenshots and controls the mouse/keyboard " +
      "step by step toward the goal, and again asks before any step that submits a purchase, sends a " +
      "message, or deletes something. Can misclick sometimes — describe the goal precisely.",
    kind: "automation",
    // RISK_REGISTER.md documents this tool's free-vision-model misclick risk
    // as distinct from (and higher than) the other 4 gated tools above.
    riskLevel: "high",
    permissions: ["os-control", "screen-capture", "network"],
    confirmationPrompt: () =>
      "This lets me click and type on your screen to do that — it can sometimes click the wrong thing, and " +
      "you can say stop at any point. Go ahead?",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "A precise, complete description of what to accomplish on screen." },
      },
      required: ["goal"],
    },
  },
];
