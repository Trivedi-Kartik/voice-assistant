---
name: add-tool
description: Add or change a voice-assistant tool (open_app, web_search style) end to end across server/ and agent/. Use whenever a new tool, a tool's args, its risk level, or its confirmation prompt is being added or modified.
---

# Adding a tool to Karvix

A tool spans both packages, which share nothing by import. Miss a step and either a boot-time assertion throws or the model is offered a tool the device can't run. Work through every step; do not skip the safety rules.

## Decide the kind first
- **client** — executed on the user's desktop, round-trips over WS (`open_app`, `set_reminder`…). Steps 1–9 below.
- **server** — resolved in-process (`remember_preference`). Add the definition (step 2, `kind: "server"`), handle it in `handleServerTool` in `server/src/ws/session.ts`. No agent work, no capability.
- **automation** — don't add; `computer_use_task` is the only one and has its own sub-loop.

## Client tool checklist
1. **Name in both contracts**: `server/src/tools/toolNames.ts` AND `agent/src/shared/toolContract.ts` (identical lists — a boot assertion throws on drift).
2. **Definition**: `server/src/tools/toolDefinitions.ts` — `id`, LLM-facing `description`, `inputSchema`, `kind`, `riskLevel`, `permissions`. `schemas.ts` derives everything from this list; never hand-edit the derived exports.
3. **Confirmation** (anything not `riskLevel: "low"` — closes things, reads private data, irreversible): add `confirmationPrompt` in the definition AND a translation for each of `hi es fr de it pt th` in `server/src/i18n/confirmationPrompts.ts`. `toolDefinitions.test.ts` enforces risk ⇄ prompt consistency.
4. **Agent implementation**: `agent/src/main/tools/<name>.ts` exporting a `ToolDefinition` (`name`, `riskLevel` and `permissions` matching step 2, zod `parseArgs`, `execute` returning `{ok, message}`). OS differences go in `<name>.win.ts` / `<name>.linux.ts` siblings.
5. **Register** in `agent/src/main/tools/index.ts` REGISTRY (a startup check throws if it differs from the contract).
6. **Capability**: add the name to `agent/src/main/deviceCapabilities.ts` (`CROSS_PLATFORM_CAPABILITIES`, or `WINDOWS_ONLY_CAPABILITIES`). The server only offers a tool whose name is in the device's `capabilities`. **Capabilities are written only at signup/login** — already-signed-in devices won't see the new tool until they log in again; say so in the changelog.
7. **Long-running tool?** Defaults are 10s (agent `TOOL_TIMEOUT_MS`) and 12s (server `ws/session.ts`). If it blocks on a human or slow work, add to `TOOL_TIMEOUT_OVERRIDES` in BOTH, server ≥ agent.
8. **User-facing copy**: help panel/portal cards and, if the tool is sensitive, the consent screen bullets — in all 8 dictionaries (`agent/src/renderer/i18n/dictionaries/`; `en.ts` is the typed source of truth).
9. **Tests**: update the hard-coded expectations in `server/src/tools/toolDefinitions.test.ts` (definition count, gated set, per-kind lists). Add behavior tests next to the code you touched.

## Safety rules (non-negotiable — see `tool-safety-reviewer` agent)
- The LLM only ever picks a tool and typed args. Never build a shell command by interpolating model-provided strings; look values up in a fixed whitelist (see `appRegistry`, `openUrl`'s http(s)-only check).
- Anything that reads private data, closes/deletes, or can't be undone must be confirmation-gated.
- Never feed untrusted page/file content back into the LLM context (`web_search` only opens a tab for this reason).

## Verify
```bash
cd server && npm run typecheck && npm test
cd ../agent && npm run typecheck
```
Then actually run the desktop app (`cd agent && npm run dev`) and trigger the tool by voice — typechecks do not exercise the OS code. Finish with the `log-change` skill and update `docs/CAPABILITY_MATRIX.md`. Optionally run the `contract-sync-checker` and `tool-safety-reviewer` agents.
