import { TOOL_NAMES } from "./toolNames.js";

// Tool schemas offered to the Groq tool-calling LLM. Names MUST exactly match
// agent/src/shared/toolContract.ts (kept in sync by hand, see toolNames.ts) and the
// client's tool registry (agent/src/main/tools/index.ts) — the LLM only ever picks
// from this fixed, typed set, never a raw command string. See docs/ARCHITECTURE.md.
export const GROQ_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "open_app",
      description: "Open a whitelisted desktop application by name.",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", description: "The app name, e.g. 'chrome', 'notepad', 'spotify'." },
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
];

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
