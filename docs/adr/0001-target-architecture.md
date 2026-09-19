# ADR 0001: Target architecture direction for Karvix 2.0

**Status:** Accepted (Phase 0 deliverable)
**Date:** 2026-09-19

## Context

`KARVIX_2_MASTER_BUILD_DOCUMENTATION.md` specifies a general target architecture (agent kernel, task engine, model router, browser/computer-use runtimes, skill system, etc.) independent of any specific repository's current state. A Phase 0 audit of the actual `ai-bot` repository (`CURRENT_ARCHITECTURE.md`, `SYSTEM_AUDIT.md`, `CAPABILITY_MATRIX.md`, `TECH_DEBT.md`, `RISK_REGISTER.md`) found several places where the master doc's generic plan, applied literally and in its generic order, would either be unsafe (extracting the most bug-prone code with zero tests) or wasteful (migrating a working, real-hardware-tested Electron shell to Tauri, or building local-model inference before its hardware-fit premise is verified) for this specific codebase.

## Decisions

1. **Model access goes behind a `ModelRouter` interface before any local-model work is attempted, and the existing Groq calls become its first adapter with zero behavior change.** This is Phase 3a, moved earlier than the master doc's generic Phase 3 slot (right after Phase 2, before Phase 4). Rationale: Groq's model catalog has already changed out from under this codebase three times, each an unplanned production incident (`RISK_REGISTER.md` #2) — the router closes that specific, already-proven-real risk cheaply, independent of whether/when local inference ever ships.

2. **Real local-model inference (llama.cpp + a local reasoning model) is deferred (Phase 3b) behind a concrete, self-resolving spike, not an open-ended survey.** The two real machines already used for live testing throughout this project (a Windows laptop, an Ubuntu Linux laptop — see `CHANGELOG.md`'s packaging history) are the hardware baseline: Phase 3b starts with the smallest viable quantized model (not a 27B-class model) run against `llama.cpp` on those two specific machines, measuring real tokens/sec and memory footprint, before any adapter code is written. If the small model is usably fast there, scale up; if not, that's the answer, immediately, without a separate research phase. This replaces the vaguer "hardware-capability survey" language from the original audit — there's no need to survey unknown hardware when known, real hardware is already available.

3. **A Playwright-based browser runtime (Phase 4) is prioritized ahead of further expanding computer-use (Phase 5) beyond what already shipped — final, not contingent.** Computer-use (screenshot + coordinate click) already exists, keeps its role as the primary path for native desktop apps with no DOM (WhatsApp and similar), and is not being removed or reduced. What changes is which mechanism handles *web-shaped* tasks specifically: the master doc's own tool-selection hierarchy (§8) treats screenshot-clicking as the fallback tier for that case, not the preferred one, and no browser-automation tooling exists at all today to prefer instead. Building it serves the exact task that originally motivated computer-use (an Amazon-style task) with the more reliable mechanism, without touching computer-use's existing scope for anything else.

4. **Electron is retained. Tauri is rejected outright for mobile, not just deferred** — `ROADMAP.md`'s own pre-existing Phase 7 already commits to a thin React Native client for Android ("smaller automation scope (Accessibility Service + Intents)"), a decision made before the master doc arrived. Adopting Tauri now would mean discarding that already-made mobile-stack decision in favor of the master doc's generic recommendation, for a desktop app with zero current blockers. This ADR ratifies the existing `ROADMAP.md` choice: Electron for desktop, React Native for mobile when Phase 7 starts, no Tauri anywhere. This is a final decision, not a deferral pending more information.

5. **Phase 1 (agent kernel) begins with a regression-test slice for the three existing confirmation state machines, before any extraction of `ws/session.ts` starts.** Rationale: this repo has zero automated tests today (`TECH_DEBT.md` #1), and the code slated for extraction contains the most bug-prone, hardest-to-eyeball-verify logic in the system (`SYSTEM_AUDIT.md` §2-3, `CHANGELOG.md`'s own bug history). Extracting it without a way to detect a behavior change first is the single highest-risk action available in the roadmap; the master doc's own Rule 8 ("verify external state") and Quality Gates (§29) require this regardless.

6. **The existing security-critical subsystems (auth token rotation/theft-detection, BYOK encryption, refresh-token storage) are explicitly marked "preserve as-is" and excluded from any near-term refactor scope**, absent a specific finding that requires touching them. Rationale: these were independently verified during this audit to already meet or exceed the master doc's own stated bar (§10-12), and "improving" already-correct cryptographic/security logic without a concrete driving finding is itself a risk, not a safety improvement.

## Consequences

- The roadmap in `IMPLEMENTATION_ROADMAP.md` reflects decisions 1-5 as explicit reorderings/splits relative to the master doc's generic phase list, each with its rationale repeated inline so a future reader doesn't need to cross-reference this ADR to understand why the order differs.
- `dependency-registry.md` records Tauri, llama.cpp, and the local-model stack as recorded-but-not-approved candidates (decision 2 and 4) rather than near-term additions.
- No code changes result from this ADR — it is a Phase 0 planning artifact. The first code change proposed as a direct consequence of these decisions is described in `IMPLEMENTATION_ROADMAP.md`'s Phase 1, slice 1 ("NEXT SAFE IMPLEMENTATION SLICE" in the Phase 0 summary).

## Alternatives considered and rejected

- **Follow the master doc's phase order literally.** Rejected: would put local-model work (an unverified-premise, high-effort phase) ahead of a browser runtime (a well-scoped, high-value phase that directly serves the product's own original motivating use case), and would risk extracting the riskiest existing code with no regression safety net.
- **Rewrite `ws/session.ts` and the model-calling layer in one large change alongside this audit.** Rejected: explicitly forbidden by the Phase 0 instructions ("do not rewrite," "do not start implementing the entire roadmap") and by the master doc's own Rule 3 ("small vertical slices"); also unsafe per decision 5's reasoning.
- **Migrate to Tauri now, ahead of any capability work, to avoid a harder migration later.** Rejected per decision 4 — no concrete near-term blocker exists, and the migration risk is real and immediate while the benefit is speculative and future.
