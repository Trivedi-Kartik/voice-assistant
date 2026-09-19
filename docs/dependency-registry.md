# Dependency Registry (Phase 0)

Per the Claude Code protocol's Rule 6. Two sections: **currently installed** (both packages, exact versions from `package.json` as read during this audit) and **candidates from the master doc** (not yet added — recorded here so a future phase doesn't skip the review step).

## A. Currently installed — `server/package.json`

| Package | Version | Purpose | License note | Local/self-hosted? | Paid-hosted coupling? | Simpler alternative? |
|---|---|---|---|---|---|---|
| `@prisma/client` / `prisma` | `^5.20.0` | ORM/DB client + CLI | MIT | Yes (talks to whatever Postgres URL is configured) | No | N/A, appropriate |
| `@sentry/node` | `^10.70.0` | Error tracking | MIT (SDK) — Sentry the *service* is a separate, optional, paid-tiered product; `sentryDsn` is optional/unconfigured-safe per `env.ts` | SDK yes; the backend it reports to is Sentry's hosted service unless self-hosted | Optional only — server starts fine with no `SENTRY_DSN` | N/A, already optional |
| `@xenova/transformers` | `^2.17.2` | Local embeddings (memory) | Apache-2.0 (package) — **model weights (`Xenova/all-MiniLM-L6-v2`) and the transitive `onnxruntime-node` native binary are separate artifacts, runtime-downloaded/loaded, not vendored, and were NOT independently license-checked in this audit** | Yes — inference runs in-process, no external API call per embed | No | See `RISK_REGISTER.md` #9 — flagged for follow-up, not resolved here |
| `bcryptjs` | `^2.4.3` | Password hashing (pure JS, no native bindings) | MIT | Yes | No | Deliberately chosen over native `bcrypt`/`argon2` specifically to avoid native-binding load failures (per code comment) — do not "upgrade" to a native alternative without re-deriving that reasoning |
| `cors` | `^2.8.5` | Express CORS middleware | MIT | Yes | No | N/A |
| `dotenv` | `^16.4.5` | `.env` loading | BSD-2-Clause | Yes | No | N/A |
| `express` | `^4.21.0` | HTTP framework | MIT | Yes | No | N/A |
| `groq-sdk` | `^0.7.0` | Groq API client | Apache-2.0 (SDK) — **the inference itself is a paid-capable, currently-free hosted API this is architecturally coupled to today** | No — API client only, all inference remote | **Yes — this is the risk register's #1 item**, not incidental | See `TARGET_ARCHITECTURE.md` §5 for the phased mitigation, not a swap-now recommendation |
| `ioredis` | `^5.4.1` | Redis client | MIT | Yes (talks to whatever Redis URL is configured, self-hostable) | No (Upstash is the current choice but not hardcoded) | N/A |
| `jsonwebtoken` | `^9.0.2` | JWT sign/verify | MIT | Yes | No | N/A |
| `uuid` | `^9.0.1` | ID generation | MIT | Yes | No | N/A |
| `ws` | `^8.18.0` | WebSocket server | MIT | Yes | No | N/A |
| `zod` | `^3.23.8` | Schema validation | MIT | Yes | No | N/A |
| `vitest` | `^4.1.11` (dev) | Test runner (added for Phase 1 slice 1 — regression tests for the 3 confirmation state machines in `ws/session.ts`) | MIT | Yes, dev-only | No | Chosen over Jest: native ESM support matches this package's `"type":"module"`/NodeNext setup without experimental flags. Dev-only — never ships in `dist/` (`tsconfig.build.json` excludes `*.test.ts`). |

## B. Currently installed — `agent/package.json`

| Package | Version | Purpose | License note | Local/self-hosted? | Paid-hosted coupling? | Simpler alternative? |
|---|---|---|---|---|---|---|
| `dotenv` | `^16.4.5` | `.env` loading (dev only — confirmed not bundled into packaged builds) | BSD-2-Clause | Yes | No | N/A |
| `electron-store` | `^8.2.0` | Local JSON persistence (reminders, custom apps, consent, device id) | MIT | Yes, fully local | No | N/A |
| `electron-updater` | `^6.3.4` | Auto-update against GitHub Releases | MIT | Client yes; the release host (GitHub) is not a paid coupling | No (GitHub Releases is free for a public/private repo of this scale) | N/A |
| `ws` | `^8.18.0` | WebSocket client | MIT | Yes | No | N/A |
| `zod` | `^3.23.8` | Schema validation | MIT | Yes | No | N/A |
| `zustand` | `^4.5.5` | Renderer state store | MIT | Yes | No | N/A |
| `electron` | `^32.1.0` (dev) | Desktop shell | MIT | Yes | No | N/A |
| `electron-builder` | `^25.0.5` (dev) | Packaging | MIT | Yes | No | N/A |
| `react` / `react-dom` | `^18.3.1` / `^18.3.1` (dev) | UI framework | MIT | Yes | No | N/A |
| `vite` | `^5.4.4` (dev) | Renderer build tool | MIT | Yes | No | N/A |
| others (`@vitejs/plugin-react`, `concurrently`, `wait-on`, `@types/*`, `typescript`) | see `package.json` | Build/dev tooling only | All MIT-family | Yes | No | N/A |

**Confirmed: no ML/audio/voice-related dependency exists anywhere in `agent/package.json`.** Browser TTS is a Web API (no npm package); the Linux fallback shells out to the OS's own `spd-say` binary rather than depending on an npm audio package. All ML dependencies (`@xenova/transformers`) live server-side only.

## C. Candidates from the master doc — NOT added, recorded for future review

None of these are installed. Per the Claude Code protocol, each must go through this same review table *at the time it's actually about to be added* (exact version pinned then, not now) — this section exists only so a future phase doesn't skip the review step, not to pre-approve anything.

| Package/project | Proposed purpose | License (to verify at add-time) | Local/self-hosted? | Paid-hosted coupling risk | Notes from this audit |
|---|---|---|---|---|---|
| Playwright | Browser runtime (Phase 4) | Apache-2.0 | Yes | No | Recommended as-is by master doc; no repo-specific concern found |
| Browser Use | Optional browser-agent accelerator | MIT | Yes, local mode | No (avoid its cloud service per master doc's own instruction) | Optional, not required for Phase 4's minimum slice |
| llama.cpp | Local inference (Phase 3b) | MIT | Yes | No | Gated on a concrete two-machine spike (Windows laptop + Ubuntu laptop already used for testing), not an open survey — see ADR 0001 decision 2. Do not add before that spike has a result. |
| Qwen3.8 model weights | Local reasoning model | Apache-2.0 per master doc's own research (needs re-verification at add-time, models change) | Yes (self-hosted weights) | No | Same gate as llama.cpp; start the spike with the smallest viable quantized model, not the full 27B class |
| faster-whisper | Local STT | MIT | Yes | No | Same gate as llama.cpp — no local-inference work should start piecemeal |
| Kokoro-82M | Local TTS | Apache-2.0 (model) — master doc itself flags voice-specific terms still need checking | Yes | No | Verify actual voice/model-card terms at add-time, not assumed from the package license |
| Tauri 2 | Desktop/mobile shell | MIT/Apache-2.0 | Yes | No | **Rejected, not deferred** — see `TARGET_ARCHITECTURE.md` §1 / ADR 0001 decision 4. `ROADMAP.md`'s pre-existing Phase 7 already commits to React Native for mobile; adopting Tauri would discard that decision for no current benefit, since Electron has zero near-term blockers. |
| React Three Fiber / Three.js | 3D UI | MIT | Yes | No | Explicitly deferred until the task-engine state model is real (master doc's own rule, echoed in `IMPLEMENTATION_ROADMAP.md`) |
| pgvector | Vector search | PostgreSQL license (extension) | Yes | No | **Already in use** — listed here only because the master doc lists it; not actually a new dependency (confirmed live in `schema.prisma`) |
| Valkey | Cache/queue | BSD-3-Clause | Yes | No | Not needed until the task engine's queueing needs actually exceed what an embedded/Redis-based queue can do — master doc's own "don't introduce infrastructure until needed" rule applies |
| MCP TypeScript SDK | Integration boundary (Phase 8) | MIT | Yes | No | Far out; no near-term action |
| OpenCUA | Computer-use model/benchmark reference | MIT | Optional sidecar | No | Reference only per master doc; not required for the already-shipped computer-use tool, which uses Groq's hosted vision model instead |

## D. Explicit license-risk flags carried forward from this audit

- `@xenova/transformers`'s model weights and `onnxruntime-node`'s binary license — not independently verified (see A, and `RISK_REGISTER.md` #9). Should be resolved before this audit's findings are considered fully closed, independent of any new phase.
- Any future voice model (Kokoro or otherwise) — verify the specific voice/model-card terms, not just the surrounding package's license, before redistribution in a packaged build. The master doc calls this out explicitly (its own §3, "Particularly sensitive examples") and it applies here the same way.
