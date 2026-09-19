# Karvix — Claude Code Phase 0 Bootstrap Prompt

Paste this into Claude Code from the root of the existing Karvix repository.

```text
You are the principal architect and senior engineer for the Karvix 2.0 project.

Read the repository as an existing production-like application that must be evolved safely.
Do NOT rewrite the application.
Do NOT delete working functionality.
Do NOT start implementing the entire roadmap.
Do NOT add large numbers of speculative dependencies.

There is a master product/architecture document available at:

KARVIX_2_MASTER_BUILD_DOCUMENTATION.md

There is also an existing CAPABILITIES.md describing what Karvix currently does.
Treat the existing implementation as the baseline and the master document as the target direction.

PHASE 0 ONLY

Your goal in this phase is to deeply audit the current repository and produce a repository-specific architecture and implementation plan.

First inspect:

1. repository structure
2. package manifests and lockfiles
3. frontend architecture
4. backend architecture
5. desktop/native integration
6. voice input/transcription
7. voice output/TTS
8. LLM/provider integration
9. prompt construction
10. tool registry and execution
11. permissions and confirmations
12. memory
13. persistence/database
14. reminders/tasks
15. authentication/user isolation
16. browser integration
17. screenshot/screen analysis
18. operating-system adapters
19. custom application registry
20. tests
21. error handling
22. logging/observability
23. deployment/build scripts
24. platform-specific assumptions
25. security-sensitive areas
26. dependency/license risks

TRACE THE REAL EXECUTION FLOWS.

For the main voice request path, trace:

microphone
→ audio capture
→ transcription
→ model request
→ model response
→ tool selection
→ tool execution
→ result handling
→ response generation
→ TTS

For a tool task, trace:

user request
→ intent
→ tool selection
→ permission check
→ execution
→ result
→ response

Do not guess. Read the actual code.

Create/update these documents ONLY after understanding the repository:

1. docs/CURRENT_ARCHITECTURE.md
2. docs/SYSTEM_AUDIT.md
3. docs/CAPABILITY_MATRIX.md
4. docs/TECH_DEBT.md
5. docs/RISK_REGISTER.md
6. docs/TARGET_ARCHITECTURE.md
7. docs/IMPLEMENTATION_ROADMAP.md
8. docs/dependency-registry.md
9. docs/adr/0001-target-architecture.md

SYSTEM_AUDIT.md must identify:

- what is already good and should remain
- what is tightly coupled
- what is fragile
- what is duplicated
- what is platform-specific
- what is difficult to test
- what will block multi-step agent execution
- what will block browser/computer use
- what will block local-model support
- what will block cross-device support
- what security problems exist
- what should be refactored vs replaced

CAPABILITY_MATRIX.md must include every current capability from the existing system and classify each as:

- preserve as-is for now
- wrap as a tool
- refactor
- replace later
- platform-specific

TARGET_ARCHITECTURE.md must explicitly separate:

- agent kernel
- planner
- executor
- observer
- verifier
- task engine
- model router
- tool registry
- policy/permission engine
- memory
- skill system
- browser runtime
- computer runtime
- device runtime
- integrations
- observability

IMPLEMENTATION_ROADMAP.md must be phase-based and safe.

Use these target phases:

Phase 0: audit/stabilization
Phase 1: agent kernel/task engine
Phase 2: tool fabric
Phase 3: local model router
Phase 4: browser agent
Phase 5: computer use
Phase 6: files/documents/research
Phase 7: memory/personal context
Phase 8: integrations/MCP
Phase 9: background tasks
Phase 10: cross-device
Phase 11: UI/3D rebuild
Phase 12: reliability/evaluation

However, reorder or split phases when the actual repository proves that a safer order is needed.
Explain why.

IMPORTANT ARCHITECTURE RULES

1. Core product must not require a paid API.
2. Local-first is mandatory.
3. The model provider must be replaceable.
4. Browser automation must prefer structured automation over screenshot clicking.
5. Computer use is a fallback for applications without better interfaces.
6. Every consequential action needs verification.
7. High-risk actions need explicit policy/approval.
8. External content is untrusted and must not automatically become agent instructions.
9. Do not put credentials into ordinary model context.
10. Existing working features are regression requirements.
11. New dependencies require license review.
12. Use npm, not pnpm.
13. Keep the main product code TypeScript. Python may be isolated to model sidecars where justified.
14. Do not introduce a mandatory cloud backend for local operation.
15. Do not build the 3D UI before the agent state model is clear.

DEPENDENCY REVIEW

For each proposed new dependency, record:

- package/project
- version to evaluate
- purpose
- license
- model/voice/dataset license where applicable
- transitive-license concerns
- whether it is local/self-hosted
- whether it introduces paid hosted-service coupling
- whether there is a simpler alternative

Do not assume an open-source repository means every associated model or voice is permissively licensed.

TESTING

Before proposing any major refactor, identify which existing tests are missing.
Do not implement a large architecture change without a regression strategy.

DELIVERABLE QUALITY

The documents must be concrete enough that another senior engineer can understand:

- current state
- target state
- migration boundaries
- risks
- first implementation slice

At the end of Phase 0, give a concise section:

NEXT SAFE IMPLEMENTATION SLICE

It must identify:

- exact subsystem
- exact files/packages likely affected
- exact interfaces to add/change
- tests required
- rollback strategy

Do not start that implementation in this phase.

Finally, run the existing build/tests that are safe to run and report their current status.

NEVER claim a test passed unless it actually ran.
NEVER claim a file was inspected unless you actually inspected it.
NEVER replace an existing feature with a mock just to make the phase appear complete.
```

## After Claude Code finishes Phase 0

Do not immediately tell Claude Code to "build everything".

Use the generated repository-specific roadmap to create one implementation slice at a time.

The first implementation request should normally be the smallest vertical slice of Phase 1 that creates:

```text
Task entity
→ persisted task state
→ one multi-step execution loop
→ one verifier
→ UI task status
→ tests
```

Then repeat the cycle:

```text
inspect
→ plan
→ implement
→ test
→ evaluate
→ document
→ commit
```
