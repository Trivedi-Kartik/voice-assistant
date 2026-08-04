// Server-side copy of the tool name contract. Deliberately duplicated rather than
// imported across packages — server/ and agent/ are separately built/deployed
// (server ships as a Docker image with no agent/ source in it), so there's no
// clean shared-module boundary without a full monorepo/workspace setup, which is
// overkill for 3 string literals. Keep this in sync with
// agent/src/shared/toolContract.ts by hand; toolSchemasMatchContract() below plus
// the client-side equivalent test are the guardrail against drift.
export const TOOL_NAMES = ["open_app", "close_app", "web_search", "open_url"] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
