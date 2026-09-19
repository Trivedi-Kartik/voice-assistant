# Target Architecture (Phase 0)

This adapts `KARVIX_2_MASTER_BUILD_DOCUMENTATION.md`'s target design to what `CURRENT_ARCHITECTURE.md`/`SYSTEM_AUDIT.md` actually found in this repository. Where the master doc's generic plan and this repo's real constraints disagree, this document says so explicitly and picks a direction — silently reconciling them would just relocate the risk, not remove it.

## 1. The one load-bearing tension this document resolves

The master doc requires: no mandatory paid/cloud API, local-first by default, a Tauri shell, Python sidecars for local STT/TTS/inference, and Playwright-first browser automation before computer-use.

The real repository is: 100%-Groq-dependent for STT/LLM/vision (free-tier, but still mandatory-cloud), Electron (not Tauri), zero browser-automation tooling, and a screenshot-clicking computer-use tool that just shipped and is currently the *only* execution path for any task beyond the 9 fixed tools.

**Decision:** do not attempt to close this gap by replacing the current stack. Close it by inserting seams the current stack doesn't have yet, and let each new capability become an *additive* adapter behind those seams. Concretely:
- Introduce a `ModelRouter` interface now, with the *existing* Groq calls as its first (and for a while, only) implementation. This makes "no mandatory paid API" achievable *later*, without a rewrite, once a local adapter exists and is good enough to be a real default — see §5.
- Do not migrate Electron → Tauri, full stop, not just "not yet." `ROADMAP.md`'s own pre-existing Phase 7 already commits to React Native for the Android companion client — a decision made before the master doc arrived. Tauri's mobile story is exactly the master doc's stated rationale for it, and this repo already chose a different mobile stack. Electron stays for desktop; React Native handles mobile when Phase 7 starts.
- Build a Playwright-based browser runtime as new capability, in parallel with hardening (not replacing) the existing computer-use tool — see §7.

## 2. Layer map, against real files

| Master doc layer | Exists today as | Target home |
|---|---|---|
| Agent kernel | Not separated — folded into `ws/session.ts` | New `server/src/agent/kernel.ts` (or a dedicated module), extracted from `Session` |
| Planner | Implicit — the Groq tool-calling loop *is* the planner today, one step at a time, no explicit plan object | New `server/src/agent/planner.ts` — starts as a thin wrapper around the existing loop, gains an explicit multi-step plan representation in Phase 1 |
| Executor | `dispatchToolCall`/`handleServerTool`/`driveAutomation` in `ws/session.ts` | Extracted into a `ToolRouter`/executor module, callable independent of a live WS connection |
| Observer | Ad hoc — `ToolResult`/`AutomationOutcome` returned inline, not a distinct concept | Formalize as the return shape every executor call produces, feeding the verifier |
| Verifier | **Does not exist.** A `ToolResult.ok:true` is trusted at face value everywhere today. | New, and genuinely new work — not a refactor of anything existing. Start with the highest-value case: verify `computer_use_task` outcomes via a fresh screenshot diff/description, since that's the tool most likely to silently "succeed" at nothing (see `SYSTEM_AUDIT.md` §3) |
| Task engine | **Does not exist as a persisted entity.** A "task" today is implicitly one WS connection's in-flight turn. | New `Task`/`TaskStep` Prisma models + engine, the core Phase 1 deliverable |
| Model router | **Does not exist.** Direct `Groq` SDK calls at 4 separate call sites. | New `server/src/models/router.ts`; existing Groq calls become the first adapter behind it, zero behavior change on extraction |
| Tool registry | Exists in spirit (`REGISTRY` in `agent/src/main/tools/index.ts`, schemas in `server/src/tools/schemas.ts`) but split across two hand-synced packages | Formalize as a real `ToolDefinition` per master doc §6 (with `permissions`/`riskLevel`/`verify` fields it doesn't have today), keeping the existing 9+1 tools' actual behavior unchanged |
| Policy/permission engine | Exists informally (`CONFIRMATION_PROMPTS`, the denylist in custom-app registration, capability-filtered schemas) | Formalize into an explicit `PolicyEngine` that the new verifier/executor consult, rather than each tool re-implementing its own ad hoc gate |
| Memory | `server/src/memory/` — real, working, already close to the master doc's local-embeddings recommendation | Preserve as-is; extend with the master doc's other memory categories (§15) only once the task engine exists to give them something to attach to |
| Skill system | Does not exist as a formal module system; tools are flat files | New `skills/` directory per master doc §22, populated by *wrapping* existing tools first (Phase 2), never rewritten |
| Browser runtime | **Does not exist.** | New, Playwright-based — see §7 |
| Computer runtime | Exists (`server/src/automation/`, `agent/src/main/tools/computerUse/`), newly shipped, real bugs already found and fixed once | Preserve, harden, and — critically — *demote to fallback tier* once the browser runtime exists for web tasks specifically |
| Device runtime | Partially exists (`Device` table, `deviceCapabilities.ts`) | Extend, don't replace, when cross-device (Phase 10) is actually reached |
| Integrations | Does not exist (no email/calendar/etc.) | New, per master doc §8, not before the task engine exists to give an integration something to be called from |
| Observability | Partial (Sentry on the server, `console.error` everywhere, no structured trace) | New structured per-task trace (master doc §30), a natural companion to the task-engine work, not a separate phase |

## 3. Agent kernel / planner / executor / observer / verifier (Phase 1 target shape)

```
AgentRequest (existing: one WS turn's transcript)
   → Planner produces an explicit, bounded plan (today: implicit, one Groq
     tool-call at a time — target: same LLM call, but the loop becomes a
     resumable Task with persisted TaskStep rows, not a bare `for` loop
     scoped to one function call)
   → Executor dispatches each step through the existing ToolRouter
     (unchanged dispatch mechanics — client tool round-trip, server-handled
     tool, or the automation sub-loop — just called from outside Session)
   → Observer captures the real ToolResult/AutomationOutcome (already exists,
     just not currently treated as a first-class object outside the call site)
   → Verifier checks the observable outcome, not just `ok:true` (new)
   → on failure: today's system just reports the tool result's message and
     lets the model react in prose; target adds one bounded, deterministic
     retry-with-different-approach step before falling through to "ask the
     user" (master doc §9) — but only after the verifier exists to have
     something to react to
```

The existing three confirmation state machines (generic gate, automation-start gate, automation-risk-step gate) map directly onto "policy engine pauses the executor" and should be preserved behaviorally, not redesigned — they are hard-won, already correct, and the single most bug-prone class of logic in the codebase (per `CHANGELOG.md`'s own history). Regression tests for these three state machines are the prerequisite for extracting them safely (see `RISK_REGISTER.md` #8).

## 4. Tool registry / skill system

Do not invent new tool shapes speculatively. Phase 2's job is to wrap the *existing* 9 client tools + `remember_preference` + `computer_use_task` into the master doc's `ToolDefinition` shape (`riskLevel`, `permissions`, optional `verify()`) with **zero behavior change** — `riskLevel` for the 4 already-gated tools becomes an explicit field instead of implicit membership in `CONFIRMATION_PROMPTS`; the 5 non-gated tools get `riskLevel: 'low'`. This is mechanical, low-risk, and immediately gives the new policy engine something real to read instead of a special-cased map.

## 5. Model router (careful, phased — see §1)

Phase 3a (this repo's real Phase 3, not the master doc's generic one): introduce the interface, migrate the 4 existing Groq call sites behind it, ship with exactly one adapter (Groq, unchanged behavior). This alone gets partway to "model provider must be replaceable" without touching any user-facing behavior.

Phase 3b (gated on a concrete spike, not an open survey — see `RISK_REGISTER.md` #11 and ADR 0001 decision 2): before writing any adapter code, run the smallest viable quantized model against `llama.cpp` on the two real machines already used for testing throughout this project (Windows laptop, Ubuntu Linux laptop), and measure real tokens/sec and memory footprint. That result directly answers whether Phase 3b is viable now, without a separate research phase. If it is, a real local adapter is added as a *second* adapter, opt-in, not a replacement for the Groq adapter. "No mandatory paid API" becomes true the day a local adapter is good enough to be the *default* for at least the core chat loop.

## 6. Verification/policy layer

New work, not a refactor. Priority order, driven by real risk (`RISK_REGISTER.md`):
1. `computer_use_task` outcome verification (highest current risk — a screenshot-based tool with no independent check that a `"done"` claim was true).
2. A deterministic risk-classification backstop layered on top of the vision model's own `risk:"high"/"low"` judgment (risk #4) — this is policy-engine work, not verifier work, but belongs to the same effort.
3. Everything else, as tools get wrapped in Phase 2.

## 7. Browser runtime (new capability, high value, addresses the original product motivation)

Playwright, per the master doc's own recommendation and license findings (`dependency-registry.md`). Execution preference exactly as master doc §8: direct API > DOM/accessibility > CLI > browser automation > computer vision > user approval. This is genuinely new work — there is nothing to extract from `web_search`/`open_url`, which only ever open a tab and read nothing back. Once this exists, `computer_use_task` should be **demoted to the fallback role it was always meant to have** for browser-shaped tasks specifically (native desktop apps like WhatsApp still need it as the *primary* path, since they have no DOM to automate against).

## 8. Cross-cutting: what does NOT change in this pass

Per the master doc's own rules (§32, "what not to build early") and this repo's own hard-won lessons (`CHANGELOG.md`): no giant rewrite of `ws/session.ts` in one change, no speculative dependencies added before a phase actually needs them, no 3D UI work before the task-engine state model is real, no local-model adapter before the two-machine spike (§5) has a result, no Tauri migration — this repo already committed to Electron + React Native and that decision is final, not conditional.
