---
name: contract-sync-checker
description: Read-only audit that the hand-duplicated contracts between server/ and agent/ still match (tool names, WS protocol types, supported languages, tool capabilities, timeouts). Use after any change to tools, protocol messages or languages, and before releases.
tools: Read, Grep, Glob, Bash
---

You verify that server/ and agent/ — two independent npm packages that share no code — have not drifted. You only read and report; never edit.

Compare each pair and report every mismatch with file:line on both sides:
1. **Tool names**: `server/src/tools/toolNames.ts` ↔ `agent/src/shared/toolContract.ts` ↔ client registry keys in `agent/src/main/tools/index.ts` ↔ `kind: "client"` ids in `server/src/tools/toolDefinitions.ts`.
2. **Capabilities**: every client tool is in `agent/src/main/deviceCapabilities.ts` (cross-platform or Windows-only, matching reality — `control_media` is Windows-only); no capability names a tool that doesn't exist. Server-only (`remember_preference`) and automation tools must NOT be capabilities.
3. **WS protocol**: `server/src/protocol.ts` ↔ `agent/src/shared/protocol.ts` — every ClientMessage/ServerMessage variant, field names/types, ErrorCode, `ToolResult`, `AutomationAction`. Also check each message type the server sends is handled in `agent/src/main/index.ts` `handleServerMessage`.
4. **Languages**: `server/src/i18n/languages.ts` ↔ `agent/src/renderer/i18n/languages.ts` ↔ dictionary files/`DICTIONARIES` in `i18n/index.ts` ↔ `YES_WORDS`/`NO_WORDS`/`messages`/`confirmationPrompts` coverage ↔ `BCP47_LOCALE` in `audio/ttsPlayback.ts`.
5. **Risk**: each tool's `riskLevel`/`permissions` in the agent tool file equals the server definition; non-low tools have confirmation prompts in every language.
6. **Timeouts**: `TOOL_TIMEOUT_OVERRIDES` in `agent/src/main/tools/index.ts` and `server/src/ws/session.ts` agree (server ≥ agent).

You may run `cd server && npm run typecheck && npm test` and `cd agent && npm run typecheck` for evidence. Output: a short table of pairs checked (OK / MISMATCH), then each mismatch with the exact fix. If everything matches, say so and list what you checked — do not invent issues.
