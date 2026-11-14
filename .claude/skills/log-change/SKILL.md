---
name: log-change
description: Update the project's documentation after any code change — CHANGELOG entry, roadmap status, tech-debt/risk registers, capability matrix, ADRs. Use at the end of every feature, bug fix, migration or decision.
---

# Keeping docs honest

This project's docs are the memory future sessions rely on, and `docs/CHANGELOG.md` is the source of truth for "what actually exists." Update them in the same change as the code.

## CHANGELOG (`docs/CHANGELOG.md`, newest first)
Add a section at the top: `## YYYY-MM-DD — <short title>`. Prose, not bullets of file names. For bug fixes use the house style: what was observed, the real root cause (verified, not assumed), what was changed, how it was verified, and what is still NOT fixed. Say plainly what was and wasn't tested (e.g. "typecheck only; not run on a real machine"). Use the real current date.

## Other docs — update only if the change touches them
- `docs/IMPLEMENTATION_ROADMAP.md` — slice/phase status when work from it lands (record verification: tests passing, mutation checks).
- `docs/CAPABILITY_MATRIX.md` — a tool/capability added, changed or removed.
- `docs/TECH_DEBT.md` / `docs/RISK_REGISTER.md` — close items you fixed; add ones you found. Prefer fixing stale entries over leaving them (several are already stale).
- `docs/dependency-registry.md` — any new npm dependency (name, why, license).
- `docs/adr/NNNN-title.md` — an architectural decision that would otherwise be re-litigated (follow `0001-target-architecture.md`'s format; next number).
- `docs/ARCHITECTURE.md` / `docs/CURRENT_ARCHITECTURE.md` — the design or as-is description changed.
- `docs/SETUP.md` — env vars, prerequisites or run steps changed.
- `CLAUDE.md` — a command, convention or architectural fact future sessions need changed. Keep it short; details belong in `docs/`.

## Rules
- Don't document aspirations as shipped. Mark unverified things unverified.
- Never put secrets (connection strings, keys) in docs.
