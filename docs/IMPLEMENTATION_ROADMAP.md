# Implementation Roadmap (Phase 0 deliverable)

Phase numbers follow `KARVIX_2_MASTER_BUILD_DOCUMENTATION.md` where the order still holds. Three splits/reorderings are made relative to the master doc's generic phase list, each explained below, because this repository's actual state makes the generic order unsafe or wasteful. This document does not authorize starting any phase beyond Phase 0 — see `KARVIX_CLAUDE_CODE_START_PROMPT.md`'s own instruction not to begin Phase 1 until Phase 0's deliverables are reviewed.

**Intended execution order** (the section headers below are grouped by master-doc phase number, not execution order — read this line, not heading order): `0 → 1 → 2 → 3a → 4 → 5 → 3b → 6...`. Phase 3b (real local-model work) is listed textually before Phase 5 only because it shares a number family with 3a; it does not start until its own hardware-capability gate is resolved, and can slide later than 5, or run in parallel, without affecting anything else in this order.

## Reordering rationale (read this before the phase list)

1. **Phase 3 ("Model Router + Local AI") is split into 3a and 3b, and 3a moves earlier — right after Phase 2, before Phase 4.** The master doc's generic order treats "remove mandatory paid API" as phase 3 in absolute terms. This repo's real constraint (`RISK_REGISTER.md` #1, #11) is that a real local-inference adapter has an unverified hardware-fit premise and is a large, uncertain lift — but the *router abstraction* (3a) is small, safe, and directly unblocks the Groq-model-churn risk (`RISK_REGISTER.md` #2) that has already caused three production incidents. Splitting lets the cheap, high-value part happen early and the expensive, uncertain part (3b) wait for a resolved hardware question.
2. **Phase 4 (Browser Agent) is prioritized ahead of hardening/expanding Phase 5 (Computer Use) beyond what already shipped — for web-shaped tasks specifically, not as a reduction of computer-use's scope.** Computer-use already exists, works end-to-end, and remains the primary path for native desktop apps with no DOM (WhatsApp and similar) — nothing about it is being removed. The master doc's own tool-selection hierarchy (§8) says browser tasks should prefer structured DOM automation over screenshot-clicking, and no browser runtime exists at all yet. Building it next directly serves the task that originally motivated computer-use (an Amazon-style task) with the more reliable mechanism, and lets computer-use settle into its correct fallback role for that one task category.
3. **A regression-test slice is inserted at the very start of Phase 1**, before any extraction of `ws/session.ts` begins. The master doc's Phase 1 demonstration ("open Chrome, search, summarize") assumes a foundation that can be safely refactored; this repo has zero tests today (`TECH_DEBT.md` #1) and the code being extracted contains the most bug-prone logic in the whole system (three confirmation state machines, `SYSTEM_AUDIT.md` §2/§3). Extracting it blind, with no automated way to know if behavior changed, is the single highest-risk action available in this roadmap.

## Phase 0 — Audit / stabilization (this phase)

Status: **complete pending review.** Deliverables: this document + the other 8 listed in `KARVIX_CLAUDE_CODE_START_PROMPT.md`. Exit criteria met: existing build works (verified fresh, `SYSTEM_AUDIT.md` §13), existing features work (traced, not rewritten), no speculative rewrite happened, architecture boundaries are now documented. Exit criterion **not** met: "tests exist for critical existing tools" — none exist; this becomes Phase 1's first slice, not a Phase 0 deliverable, since writing meaningful tests requires the extraction work Phase 1 is actually for.

## Phase 1 — Agent Kernel

**Goal:** turn the one-turn assistant into a resumable, multi-step task engine, without changing any current user-visible behavior.

**Slice order** (per the master doc's own "small vertical slices" rule, and Rule 3 in its Claude Code protocol):
1. **Done.** Regression-test harness for the 3 existing confirmation state machines (generic gate, automation-start gate, automation-risk-step gate) — `server/src/ws/session.test.ts`, Vitest (new devDependency, see `dependency-registry.md`), 16 tests, all passing against the real `classifyConfirmation`/`getConfirmationPrompt`/`CONFIRMATION_PROMPTS` logic with only the I/O boundary (Groq, Redis, Postgres, the WS client round-trip) mocked. Verified the tests have real teeth, not just passing vacuously, by deliberately breaking `classifyConfirmation`'s punctuation-stripping and confirming exactly the punctuation-regression test failed, then reverting. No production code changed in this slice.
2. **Done.** `Task`/`TaskStep` Prisma models + fire-and-forget persistence, wired into every existing exit point of `Session.runTurn()` (completed/paused/failed) with zero control-flow change — verified by the full slice-1 regression suite still passing unchanged, plus 4 new tests asserting the recording itself (including that a recording *failure* never affects the turn). Migration validated against a throwaway local Postgres container and destroyed; **not yet applied to production** pending confirmation.
3. **Done.** Extracted the main tool-calling loop out of `Session.runTurn()` into `server/src/toolLoop.ts` — a plain function taking a small `ToolLoopDeps` interface, no `Session`/WebSocket dependency at all. Scoped deliberately to just the loop itself (deciding/dispatching each step); the two pre-loop cross-turn confirmation-resolution blocks stay in `Session` for a later slice, since extracting those would require a getter/setter interface for Session's own private state instead of a clean return value. Verified genuinely safe two ways: all 20 slice-1/2 regression tests pass **byte-for-byte unchanged** (file untouched — confirmed via `git diff`), and a deliberate mutation (disabling the confirmation-gate check) was confirmed to break exactly the 14 gate-dependent tests across both files before being reverted. Added 4 new direct unit tests against `runToolLoop` itself, with zero `Session`/WS mocking — concrete proof it's actually callable standalone now.
4. Wire cancellation/resume against the new `Task` persistence.
5. UI: live task-step status (small — the `AutomationPanel.tsx` pattern already shipped is a direct precedent to extend, not invent).

**Demonstration:** the master doc's own — "Open Chrome, search for X, read the top results, and summarize them" — is **not achievable at the end of Phase 1 alone**, because "read the top results" requires the browser runtime (Phase 4), which doesn't exist yet. Phase 1's actual demonstration for this repo: an existing multi-tool request (e.g. "open Spotify, pause it, then remind me in 10 minutes") runs as a real, persisted, resumable `Task` instead of an ephemeral in-function loop, and survives a server restart mid-task.

**Exit criteria:** multi-step task works (using only tools that already exist), task resumes after interruption, a failed step can recover, a task can be cancelled, UI shows live task state, and — added for this repo specifically — the 3 confirmation state machines pass their new regression tests unchanged.

## Phase 2 — Tool Fabric

**Goal:** wrap the existing 9 client tools + `remember_preference` + `computer_use_task` into the master doc's typed `ToolDefinition` shape. Zero behavior change — this is `CAPABILITY_MATRIX.md`'s "wrap as a tool" column, executed.

**Exit criteria:** all currently-working functionality remains operational through the new tool layer (verified against the Phase 1 regression tests plus new tool-level tests written as part of this wrapping).

## Phase 3a — Model Router (moved earlier — see rationale above)

**Goal:** one `ModelRouter` interface; the 4 existing direct-Groq call sites (`llm.ts`, `stt.ts`, `vision.ts`, `automation/vision.ts`) become its first adapter. Zero behavior change.

**Exit criteria:** every model call in the codebase goes through the router; a model-name change (the exact class of incident that's already happened 3 times) requires editing one config/adapter, not hunting call sites.

## Phase 4 — Browser Agent (moved earlier — see rationale above)

**Goal:** Playwright-based structured browser automation, per master doc §19. This is genuinely new capability, not an upgrade of `web_search`/`open_url` (which are preserved as-is for their current simple use).

**Demonstrations:** the master doc's own — "Find three laptops under X and create a comparison table," "Open this website, fill this non-sensitive form, and stop before submit."

**Exit criteria:** at least one real multi-step browser task completes with verified state (not just "the tool returned ok:true") — directly closing `SYSTEM_AUDIT.md` §8's finding that no browser-outcome verification exists today at all.

## Phase 3b — Local Model Adapter (deferred, gated on a resolved question — see rationale above)

**Goal:** add a llama.cpp + local-model adapter behind the Phase 3a router, opt-in.

**Gate before starting:** run the smallest viable quantized model against `llama.cpp` on the two real machines already used for testing throughout this project (Windows laptop, Ubuntu Linux laptop) and measure real tokens/sec and memory footprint — no adapter code before this result exists. This directly answers `RISK_REGISTER.md` #11 using hardware already in evidence, rather than an open-ended survey of unknown machines.

## Phase 5 — Computer Use (mostly already shipped — this phase is hardening, not building)

**Goal:** the master doc frames this as new construction; in this repo it already exists (`server/src/automation/`, `agent/src/main/tools/computerUse/`). This phase's real work is: (a) demote it to the fallback role once Phase 4 exists for browser tasks, (b) build the outcome verifier (`TARGET_ARCHITECTURE.md` §6) that doesn't exist yet, (c) add the deterministic risk-classification backstop (`RISK_REGISTER.md` #4), (d) build a small real-task eval set to put a number on the misclick rate (`RISK_REGISTER.md` #3) instead of just disclosing it as a guess.

## Phase 6 onward — unchanged from the master doc

Phases 6-12 (Files/Documents/Research, Memory/Personal Context, Integrations/MCP, Background Agent, Cross-Device, UI/3D Rebuild, Reliability/Evaluation Lab) are adopted as-written from the master doc — this audit found no repo-specific reason to reorder them, and speculating about their detail now would violate the "do not implement future phases" rule this document itself is bound by. Each should get its own repo-specific slice plan when it's actually about to start, the same way Phases 1-5 got one here.

## What is explicitly NOT part of this roadmap yet

Per the master doc's own "what not to build early" list and this repo's findings: no Tauri migration (rejected outright — `ROADMAP.md`'s existing React Native commitment for mobile stands, `TARGET_ARCHITECTURE.md` §1), no 3D UI work, no billing/Stripe, no unrestricted shell execution, no local-model adapter code before the two-machine `llama.cpp` spike has a result.
