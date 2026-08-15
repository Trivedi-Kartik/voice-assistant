# Changelog

All notable changes to this project are logged here, most recent first.
This file is updated every time we add or change something — treat it as the
source of truth for "what actually exists right now" vs. the Roadmap's "what's next."

## 2026-08-15 — Documented (not fixed — confirmed not fixable in-app) the Linux AppImage sandbox crash

Tried three in-app fixes for the AppImage crashing on launch with "SUID
sandbox helper binary... not configured correctly" — `app.commandLine
.appendSwitch("no-sandbox")`, adding `"no-zygote-sandbox"` alongside it, and
setting `process.env.ELECTRON_DISABLE_SANDBOX` before `electron` is ever
required (confirmed via the compiled output that this ran first). All three
tested directly against a rebuilt AppImage; none worked. Root cause: an
AppImage extracts its bundled `chrome-sandbox` helper to a per-run temp
directory at the *invoking user's* permissions every time — it can never be
root-owned with the setuid bit, which Chromium's sandbox requires — and the
check happens in Chromium's native startup, before any of the app's own
JavaScript runs at all, so no code running "inside" the app can beat it.
This is a general Electron+AppImage+Linux limitation, not fixable short of
switching to a `.deb`/`.rpm` target with a root-privileged install step.
`docs/SETUP.md` now documents the one thing that does work: launching from a
terminal with `--no-sandbox` (verified directly). A plain double-click does
not work yet.

## 2026-08-15 — Fixed the packaged client always connecting to localhost

`docs/SETUP.md` used to say "point the packaged client's `.env` at your
production URL before building the installer" — verified by tracing the
actual compiled output that this **does not work**: `electron-builder.yml`'s
`files:` never bundles `.env` into a packaged app, and plain `tsc` (this
project's main-process build step) doesn't inline env vars, so a packaged
build always fell through to the hardcoded `http://localhost:8080` /
`ws://localhost:8080` defaults regardless of `.env`'s contents — every real
user's installer would have silently tried to talk to their own machine.
Never caught before because packaging + connecting had never actually been
tested end-to-end together until now.

Fixed by making `agent/src/main/auth/authManager.ts`'s `SERVER_HTTP_URL` and
`agent/src/main/ws/connection.ts`'s `SERVER_WS_URL` fall back to the real
production URLs (`https://karvix-server.onrender.com` /
`wss://karvix-server.onrender.com`) directly in source — this is what
"baked in at build time" actually has to mean given how this build is
structured. Local dev is unaffected (dev's own `.env` still sets these
explicitly, which still wins). Verified the compiled `dist/main` output
contains the production URL, then built and ran the real AppImage.

## 2026-08-15 — Fixed the Docker build/runtime: two real bugs, never caught before

`server/Dockerfile` had never been successfully built until the first real
Render deploy attempt just now. Both bugs below were latent since whenever
this Dockerfile was first written — actually building and *running* the
image (not just reading it) is what surfaced them:

- **Build failure:** `npm install` runs Prisma's own `postinstall: prisma
  generate` hook automatically, but `prisma/schema.prisma` hadn't been
  copied into the image yet at that point in either build stage (that
  happened later, at `COPY . .` / a later `COPY prisma ./prisma`) — so
  postinstall failed and killed the whole build immediately, in both
  stages, every time. Fixed by copying just `prisma/schema.prisma` before
  `npm install` in both stages.
- **Runtime failure, would have been silent otherwise:** even after the
  build succeeded, actually running the container and hitting a real
  DB-touching route (not just `/health`, which doesn't touch Postgres)
  crashed with `Error loading shared library libssl.so.1.1: No such file or
  directory`. Root cause: `node:20-alpine` ships `libssl.so.3` (OpenSSL 3.x)
  as a base dependency but no `openssl` CLI binary — Prisma's engine-
  selection script uses that binary to detect which OpenSSL build to
  bundle, and silently guessed wrong ("1.1.x") when it found none present.
  Fixed with `RUN apk add --no-cache openssl` in both stages, so detection
  is accurate instead of a wrong guess. Verified with a real local `docker
  build` + `docker run` + an actual DB-touching `/auth/login` request
  against real Neon credentials, not just a clean build log.

## 2026-08-15 — Switched hosting target: Fly.io → Render

- **Why:** Fly.io deprecated its free "Hobby" allowance in 2024; its current
  signup/billing policy could not be confirmed as genuinely card-free from
  outside an account (checked its own docs and pricing pages directly, got
  inconclusive/conflicting answers) — a real problem given "free only, nothing
  paid" was an explicit, non-negotiable requirement for this launch. Should
  have verified this before building the Fly deploy plan in the first place,
  not after.
- Confirmed Render's free tier directly against its own docs (not secondary
  listicles): supports WebSocket connections on the free plan (an active
  connection counts as activity, preventing spin-down), 750 free instance
  hours/month, and — confirmed against the user's own existing free Render
  account — no credit card required.
- `server/fly.toml` removed. New `render.yaml` Blueprint at the repo root
  (Render's convention — not inside `server/`), using `rootDir: ./server` to
  scope the build to this monorepo's backend, reusing `server/Dockerfile`
  unchanged. Same scale-to-zero/cold-start trade-off as the original Fly
  plan, just via Render's 15-minute idle timeout instead of Fly's
  `auto_stop_machines`.
- `docs/SETUP.md`'s deploy section rewritten for Render's dashboard-driven
  Blueprint flow (connect repo → Render detects `render.yaml` → prompts once
  for the `sync: false` secrets) in place of the `fly launch`/`fly secrets
  set`/`fly deploy` CLI flow.

## 2026-08-15 — Go-live prep: small invited beta, free-tier only

- **Scope, decided explicitly:** a small personally-invited beta (not open
  public signup) on free-tier infra only — no code-signing cert, no login
  brute-force protection, no formal ToS review this round; all three
  explicitly deferred, see `docs/ARCHITECTURE.md` "Security / privacy."
- `server/fly.toml`: real app name (was a placeholder), and switched to
  scale-to-zero (`auto_stop_machines = "stop"`, `min_machines_running = 0`)
  to stay inside Fly's free allowance for low, intermittent beta traffic —
  trades a ~1-2s cold start after idle periods for zero always-on cost.
- Added `server/.dockerignore` (never existed — `.env`/`node_modules`/`.git`
  had nothing stopping them from entering the Docker build context).
- New `GET /privacy` (`server/src/privacyPolicy.ts`) — a real, honest,
  plain-language privacy policy, linked from the consent screen and
  Settings. Closes the long-dangling `ConsentScreen.tsx` reference to an
  ARCHITECTURE.md section that never existed until now.
- `@sentry/node` wired in (`server/src/index.ts`), optional via `SENTRY_DSN`
  — feeds today's earlier crash-safety guards (`unhandledRejection`/
  `uncaughtException`/global Express error middleware) so errors are
  actually surfaced, not just logged into the void. Free tier (5k events/mo).
- `agent/electron-builder.yml`: added a Linux `AppImage` target (no install
  step — simplest for handing a file to a few invited testers). Building and
  running it for the first time surfaced two real, pre-existing bugs that
  had never been caught because packaging had never actually been run
  before: (1) `nsis.allowToChangeInstallDirectory` isn't a valid
  electron-builder 25.x property (schema validation rejected the *entire*
  config, blocking packaging on both platforms, not just Linux) — correct
  name is `allowToChangeInstallationDirectory`; (2) the bare-string
  `extraResources: [build/icon.png]` copies to `resources/build/icon.png`
  (preserving the source path), not `resources/icon.png` as
  `trayMenu.ts` assumes — needed the explicit `{from, to}` form to flatten
  it. Verified end-to-end: built the AppImage on this machine, ran it
  (`--appimage-extract-and-run`, this sandbox has no FUSE), confirmed the
  tray icon now loads with no error.
- Documented `JWT_SECRET` generation in `docs/SETUP.md` (`openssl rand
  -base64 48`) — previously only `BYOK_ENCRYPTION_KEY` had a real generation
  command; `JWT_SECRET` just said "some long random string."

## 2026-08-15 — Forced LLM migration: Llama 3.3 → `openai/gpt-oss-120b`

- **Not a choice — a deadline:** Groq decommissioned `llama-3.3-70b-versatile`
  effective 2026-08-16 (console.groq.com/docs/deprecations). Of Groq's two
  suggested replacements, picked `openai/gpt-oss-120b` (production model,
  confirmed tool/function-calling support) over `qwen/qwen3.6-27b` (explicitly
  marked "preview — evaluation purposes only" by Groq, tool-calling support
  undocumented — too risky for this app's entire tool-dispatch loop to run on).
- **Multi-language impact, flagged not silently absorbed:** the just-shipped
  8-language feature (`en`/`hi`/`es`/`fr`/`de`/`it`/`pt`/`th`) was scoped to
  Llama 3.3's officially-validated language list. OpenAI's own gpt-oss-120b
  multilingual eval (MMMLU, 14 languages) covers Hindi, Spanish, French,
  German, Italian, and Portuguese — but not Thai. Decision: kept Thai in the
  supported list rather than removing it pre-emptively — not being in
  OpenAI's flagship eval doesn't mean broken, and the plan is to verify it
  with real Thai voice commands once possible, same empirical approach used
  elsewhere in this project, revisiting only if it actually misbehaves.
- Updated the retry-logic comments in `groqErrors.ts`/`llm.ts`/`ws/session.ts`
  and `docs/ARCHITECTURE.md`'s "Known reliability limitation" section to stop
  citing Llama 3.3-specific failure rates as current fact — the `tool_use_failed`
  retry is kept (the failure shape is API-level, not model-specific) but its
  actual rate on gpt-oss-120b is unverified until tested against real usage.

## 2026-08-11 — Linux compatibility, increment 1: `open_app`/`close_app`

- **Audited what actually needed Windows-specific code first:**
  `web_search`, `open_url`, `set_reminder`, `read_clipboard`, and
  `take_screenshot_and_describe` were already standard cross-platform
  Electron APIs — nothing to change. Only `open_app`/`close_app`,
  `control_media`, and `add_custom_app` were genuinely Windows-specific.
  This increment covers `open_app`/`close_app` only; the other two are
  deferred to their own increments (see `ROADMAP.md`).
- New platform-dispatch split: `appRegistry.win.ts`/`appRegistry.linux.ts`
  (data) and `appExec.win.ts`/`appExec.linux.ts` (execution), each behind a
  thin dispatcher chosen by `process.platform`. `openApp.ts`/`closeApp.ts`
  themselves needed zero platform-specific code — they just call the
  dispatchers.
- **Real correctness point, not just swapping the command:** opening an app
  on Linux uses `spawn(cmd, args, { detached: true }).unref()`, not
  `execFile()` — `execFile`'s promise only resolves when the child exits,
  which would hang the tool call for as long as a launched GUI app stays
  open. Verified directly in this dev sandbox (it's Linux): a 5-second
  child via `execFile`-style waiting would block ~5000ms; the
  `spawn`+`unref()` approach resolves in ~250ms regardless, and a
  nonexistent binary's `ENOENT` still gets caught (fires in ~2ms, well
  inside the 250ms grace window) rather than reporting false success.
- `appRegistry.linux.ts` is a smaller, explicitly best-effort/unverified
  starter list — apps with no honest Linux equivalent (Word/Excel/PowerPoint,
  WhatsApp, classic Teams, mspaint) are left out rather than mapped to a
  wrong analogue.
- `control_media`/`add_custom_app` excluded from `DEVICE_CAPABILITIES` on
  non-Windows devices (server never offers those tool schemas to a Linux
  client's LLM context at all), plus a one-line defensive platform check
  inside each tool itself.
- Also fixed: `authManager.ts` hardcoded `platform: "windows"` regardless of
  actual OS — wrong on every non-Windows device already, independent of
  this increment landing.
- **Verified in this sandbox** (confirmed real binaries: `pkill`,
  `xdg-open`, `x-terminal-emulator`, `gnome-calculator` all exist here, and
  `pkill -x`/`-i` are real flags with the documented semantics) — but still
  needs a pass on an actual Linux desktop to confirm a GUI app's window
  really appears, same caveat class as every Windows claim needing the
  user's real machine.

## 2026-08-11 — Fix add_custom_app on Microsoft Store apps; force English STT

- **Real bug, reported from live use:** adding a Microsoft Store app (e.g.
  ChatGPT) via `add_custom_app` silently added the wrong thing — saying
  "open chatgpt" afterward opened the Microsoft Store instead of the app.
  Root cause: Store/UWP apps live in a protected folder a file picker can't
  properly browse into or select from, so browsing for one landed on
  something that redirects to the Store rather than the real app.
- Fixed by resolving through `Get-StartApps` first — Windows' own list of
  every installed Start Menu entry, traditional and Store apps alike — via
  a **fixed, parameter-less** PowerShell command; the spoken name is only
  ever compared against the returned list in plain JS, never interpolated
  into the command. Only falls back to the file picker if there's no
  unambiguous match. A Store app's `AppID` (`"<PackageFamilyName>!<AppId>"`)
  flows through the *exact same* `cmd.exe /c start` mechanism `openApp.ts`
  already uses for a real exe path — zero execution-side branching needed.
  Store apps get no `processName` (same "open-only" convention as File
  Explorer) since a UWP AppID isn't a real process name to give `taskkill`.
- **Second real bug, reported in the same message:** voice-to-text was
  occasionally transcribing English speech into an entirely different
  language. Root cause: `server/src/stt.ts` never told Whisper what
  language to expect, so it auto-detected per utterance — a known Whisper
  failure mode on accented English. Fixed with a one-line `language: "en"`
  on the transcription call, since Karvix is English-only everywhere else
  already (system prompt, docs, UI).
- Renamed `CustomApp.exePath` → `openCommand` (now holds either a real path
  or a `shell:AppsFolder\...` string) and made `processName` optional,
  matching `appRegistry.ts`'s existing `AppEntry` shape exactly.
- **Not yet verified:** the real `Get-StartApps` resolution and the STT fix
  — this dev environment is Linux, needs a pass on the user's Windows
  machine. If you already added "chatgpt" incorrectly before this fix,
  remove it in Settings → "My apps" and add it again.

## 2026-08-11 — Fix login/signup: the *previous* responsive fix was incomplete

- **Real bug, reported after the last fix shipped:** the earlier
  "maximized window" fix only scaled the auth card's own container and two
  headline text elements (wordmark, subtitle) with `clamp()` — it missed
  the actual controls inside it. So the card grew when the window was
  maximized, but the tab buttons, inputs, and the submit button kept their
  flat, fixed font-size and padding, which looked *more* wrong than
  before: a big card with small, cramped-looking controls floating inside it.
- Fixed properly this time: `.tabs`/`.tabs button`, `.field label`/
  `.field input`, `.cta`, and `.switch-line` all now scale with `clamp()`
  too, so every control in the form grows together with the card instead
  of just the container.
- Applied the same fix to the Consent screen's button, which had the
  identical problem (a `clamp()`-scaled card with a plain, fixed-size
  global button inside it) — fixing it now rather than waiting to be told
  about it separately.

## 2026-08-11 — Redesign the "What can I ask?" screen

- **Real design gap, called out directly:** the Help screen had been left as
  a flat text list while every other screen got the glassmorphic redesign
  pass — under-designed relative to the rest of the app.
- Rebuilt using the *same* visual language already established, not a new
  one: a large `BotAvatar` (new `size="lg"` variant) as a real hero moment,
  capabilities grouped into 5 categories (Apps, Media & reminders, Web,
  Privacy-sensitive, Memory) each with a small icon in a gradient-tinted
  badge, and each capability as its own glass card instead of a bare line
  of text.
- Confirmation status is now a visible signal instead of buried in a
  sentence — anything gated by the spoken-confirmation flow
  (`close_app`/`add_custom_app`/`read_clipboard`/`take_screenshot_and_describe`)
  gets a small "Confirms first" pill next to it.
- The "Memory" category icon deliberately reuses the exact node-and-line
  constellation from the voice orb's core (`VoiceOrb.tsx`) — same motif,
  same meaning, wherever it appears, rather than inventing a new icon
  language just for this screen.
- Also gave this panel the same `clamp()`-based responsive sizing as the
  auth card fix, so it doesn't inherit the "stays small when the window is
  maximized" bug.

## 2026-08-11 — `add_custom_app`: user-level ability additions, kept safe by construction

- **New tool: `add_custom_app`.** A user can now extend their own app list
  by voice ("add Photoshop as an app I can open") — discussed at length
  first, since letting the AI add abilities on its own (or even
  user-approved-but-AI-authored ones) is genuinely unsafe: no automated
  checker can reliably verify novel AI-authored behavior before it touches
  a real computer, no matter how strict the check. What's actually safe,
  and what this ships: a user can add more *names* to the two action types
  that already exist and are already reviewed (`open_app`/`close_app`) —
  never a new kind of action.
- Safety is structural, not a soft rule: `execute()` opens a native file
  picker (`.exe` filter) — the user must browse to and select a real,
  already-existing file; there's no text field anywhere in the flow to
  type a command into. `close_app`'s `processName` is derived mechanically
  from the picked file's own name. A fixed denylist blocks picking known
  system binaries (`cmd.exe`, `powershell.exe`, `regedit.exe`,
  `certutil.exe`, etc.) as defense in depth on top of that.
- Gated by the same spoken-confirmation flow as `close_app`/`read_clipboard`/
  `take_screenshot_and_describe`. Stored per-device only
  (`customAppStore.ts`, same `electron-store` pattern as `reminderStore.ts`)
  — one user's added app is invisible to everyone else.
- `appRegistry.ts`'s `lookupApp`/`knownAppNames` merge custom entries with
  the built-in list transparently — `open_app`/`close_app` needed zero code
  changes to actually use a custom app once added.
- **Real timing issue caught before shipping, not after:** a human browsing
  a file dialog routinely takes longer than the existing 10s (client) /12s
  (server) default tool timeout. Added a small `TOOL_TIMEOUT_OVERRIDES` map
  on both sides giving this specific tool ~90s — every other tool keeps its
  strict default.
- Small Settings addition: a "My apps" list to see and remove what's been
  added, via two new IPC handlers (not voice-driven — lower-stakes than
  adding one).
- **Not yet verified:** the real file dialog, denylist rejection, and a full
  voice round-trip — this dev environment is Linux, needs a pass on the
  user's Windows machine.

## 2026-08-11 — Fix login/signup not scaling when the window is maximized

- **Real bug, reported from live use:** the redesigned auth card looked
  fine at the default window size but stayed pinned to a small fixed size
  when the window was maximized on a larger screen. Two separate hardcoded
  values were responsible: `.auth-card`'s `max-width` was a flat `340px`
  (never grew regardless of available space), and `VoiceOrb`'s size on the
  login screen was a fixed `84px` passed in via inline JS from a `size`
  prop, not tied to viewport size at all.
- Fixed by switching both to `clamp()`-based sizing that scales with the
  window: `.auth-card`/`.consent-screen`'s card, and `VoiceOrb`'s two size
  variants (`orb-wrap-main`/`orb-wrap-small`, replacing the old numeric
  `size` prop entirely). Card typography (wordmark, subtitle) scales with it
  too, so it reads as one proportional composition instead of a fixed-size
  card floating in empty space on a large screen.

## 2026-08-11 — Visual redesign: glassmorphic, signal-gradient, AI-styled orb

- **Whole-app visual redesign**, following an approved direction mockup —
  glassmorphic cards, a violet/magenta/coral "signal" gradient spent
  deliberately in one place (the orb, primary buttons, active states), an
  ambient drifting aurora backdrop with slow particles, and a small drawn
  bot avatar for the assistant in chat instead of a generic letter.
  `agent/src/renderer/styles.css`'s color tokens were replaced wholesale
  (one source of truth, not new tokens alongside old hardcoded hex values).
- **`VoiceOrb.tsx` rewritten from `<canvas>` to pure CSS/SVG** — glow,
  dashed ring, a radar-style sweep, three independently-orbiting
  satellites, and a gradient core with a pulsing neural-line constellation.
  The whole motif is rotation/opacity/scale `@keyframes`, so the old
  per-frame `requestAnimationFrame` particle-ring loop is gone entirely.
  Kept the *functional* part of the old design — state encoded in color
  (idle/listening/thinking/speaking each get a distinct 3-stop gradient) —
  but simplified motion to two tiers (idle calm / any-active energetic)
  instead of 4 distinct speed profiles.
- `LoginScreen.tsx` restructured to a floating glass auth card with a small
  orb, a real tab toggle (Log in / Sign up) instead of a mode-switch link,
  and glass-styled inputs. Settings/Help/Consent inherit the new tokens and
  glass treatment for consistency, but not the orb/bot/particle motifs —
  those are specific to the two screens the approved mockup actually showed.
- **Also landed, found during the same pass:**
  - Removed the tool-activity chips from the chat view entirely (e.g.
    "✗ take_screenshot_and_describe — ...") — real user feedback that they
    were just noise. Cleaned up the now-dead code behind them (`TOOL_LABELS`,
    the `"tool"` turn role, the chip rendering in `ConversationView.tsx`).
  - Login/signup speed: `bcryptjs` (pure-JS, not native bindings) was
    hashing at cost factor 12 on every signup/login — dropped to 10, still
    solidly within current security guidance, meaningfully faster.
  - A real, pre-existing layout bug caught while touching this area:
    `.link-button`/`.retry-button` had no explicit `display`, so the global
    `button { display: block }` reset made text like "Sign up" wrap onto
    its own line instead of sitting inline after "Need an account?" — fixed
    with `display: inline`.
- **Not yet verified:** this dev environment has no display, so the actual
  rendered result (motion, glass/blur rendering, layout at the real 480×760
  window size) needs a pass on the user's Windows machine, same as every
  prior increment.

## 2026-08-11 — Fix spoken confirmation never actually resolving

- **Real bug, confirmed via a live screenshot:** saying "yes" to a
  confirmation question (e.g. "Close chrome? Say yes to confirm.") never
  actually closed the app — it just re-asked the same question forever, even
  after repeating "yes" multiple times. Two compounding causes:
  1. `classifyConfirmation` never stripped trailing punctuation. Whisper
     transcribes "Yes." (with a period), which matched neither `=== "yes"`
     nor `startsWith("yes ")` — every plain "yes" was silently misclassified
     as unclear, which defaults to declined.
  2. Deeper issue: even on decline, the code re-answered the *original*
     `tool_call_id` from the question-asking turn — but that call was
     already fully closed out with a placeholder in that same turn.
     Re-answering an already-answered tool call, with a new user message now
     sandwiched in between, is an invalid message sequence for Groq's chat
     format (a `tool` message must immediately follow the assistant message
     with the matching `tool_calls`) — almost certainly why the model kept
     re-issuing the same call instead of reacting to "yes" sensibly.
- Fixed: `classifyConfirmation` strips trailing punctuation before matching.
  On a real "yes," `server/src/ws/session.ts` now mints a brand-new,
  self-contained `tool_calls`/`tool` exchange (fresh call ID, no reference to
  the old one) instead of trying to reuse the closed-out original.

## 2026-08-11 — Karvix didn't know its own name; add an in-app "what can I ask" screen

- **Real bug, found via live testing:** greeting the assistant by name
  ("Hi Karvix") got a confused/generic reply. Root cause: the product's
  rename to Karvix only ever touched branding surfaces (window title, tray,
  `package.json`) — the LLM's system prompt (`server/src/ws/session.ts`)
  still just said "You are a helpful voice assistant," never mentioning the
  name at all. Fixed: the prompt now says "You are Karvix" and explicitly
  tells the model to respond naturally when greeted by name, not as if asked
  about a third party.
- **New: an in-app "What can I ask?" screen**
  (`agent/src/renderer/components/HelpPanel.tsx`), opened from the header
  next to Settings. `docs/CAPABILITIES.md` lives in the repo, which an actual
  installed-app user never sees — this is the same content, written for an
  end user, inside the app itself. `ROADMAP.md`'s per-tool checklist now
  calls for updating both, not just the repo doc.
- Also fixed while touching `App.tsx`: `TOOL_LABELS` (used for the
  tool-activity chips) only had 3 of the 8 tools that exist today — every
  tool added since Phase 3 increment 1 forgot to add its label, so newer
  tools' chips showed a raw snake_case name instead of a real label.

## 2026-08-11 — Replace click-to-confirm popup with spoken yes/no

- **Changed based on real usage feedback:** `close_app`, `read_clipboard`,
  and `take_screenshot_and_describe` no longer gate on a client-side
  `dialog.showMessageBox` Allow/Deny popup — requiring a mouse click defeated
  the point of a voice-first assistant. Now the assistant asks out loud
  ("Close Chrome? Say yes to confirm.") and the *next* voice turn resolves
  it — a clear "yes" runs it for real, anything else (including silence or
  an unrelated reply) cancels it.
- This moved the whole mechanism server-side, into `Session`
  (`server/src/ws/session.ts`): a new `pendingConfirmation` field, a
  deterministic `classifyConfirmation` keyword match (unclear defaults to
  "no," same fail-safe the old dialog's `cancelId` already had), and
  `CONFIRMATION_PROMPTS` (`server/src/tools/schemas.ts`) as the server-side
  replacement for what each tool's `describe()` used to do. The `sensitivity`
  and `describe` fields are gone entirely from `ToolDefinition`
  (`agent/src/main/tools/types.ts`) and every tool file — the client no
  longer has any concept of "this one needs confirmation."
- The real constraint this had to respect: every `tool_calls` entry in an
  assistant message must be answered by a matching `tool`-role message
  before the next Groq call, so "pausing" still answers the call immediately
  with a placeholder, and the spoken question is injected as a separate,
  hand-written assistant message — deliberately not something asked of the
  model via another completion call, since real testing this session
  already showed Groq's tool-calling isn't reliable enough to trust with an
  "ask, don't call the tool again" instruction.
- Safety invariant preserved despite the speed-up: a sensitive tool call
  cannot execute without going through this state machine, no matter how a
  batch of tool calls is shaped — see `docs/ARCHITECTURE.md` "Confirmation
  for sensitive tools."
- **Not yet verified:** a real two-turn voice exchange on Windows (ask →
  confirm → runs; ask → decline → doesn't run).

## 2026-08-11 — Fix take_screenshot_and_describe's decommissioned vision model

- **Real bug, confirmed via live testing:** the vision model chosen at
  increment-4 ship time, `llama-3.2-11b-vision-preview`, had already been
  decommissioned by Groq (`model_decommissioned` — `console.groq.com/docs/deprecations`).
  Every screenshot request failed with a 502 from `/vision/describe`.
  Switched `server/src/vision.ts`'s `VISION_MODEL` constant to
  `qwen/qwen3.6-27b`, Groq's current production vision model per their
  vision docs. This is the second time Groq's vision-model lineup has
  changed within this project's short lifetime — worth treating the
  constant as needing a periodic check, not a one-time choice.
- Diagnosing this surfaced that the agent's dev workflow has a real gotcha
  worth remembering: `agent/`'s main process runs from `tsc -w`-compiled
  `dist/main/*.js`, and Electron does **not** hot-reload it — only the
  renderer has Vite HMR. A `git pull` alone, without fully killing and
  restarting `npm run dev`, silently keeps running stale main-process code
  with none of whatever was just fixed.

## 2026-08-04 — Fix zero-arg tool calls failing with a raw Zod error

- **Real bug, found via live testing:** `take_screenshot_and_describe` (and
  `read_clipboard` — any zero-argument tool) failed every time with
  `Expected object, received null`. Root cause: `llm.ts`'s `safeParseArgs`
  only caught JSON *parse* failures, but the model sometimes emits the
  literal string `"null"` for "no arguments," which `JSON.parse` accepts
  without throwing — so a bare `null` reached the client's
  `z.object({}).parse(null)` downstream and threw. Fixed by normalizing any
  non-object parsed result to `{}`.
- **Also fixed:** that error's raw Zod issue array (`[{"code":"invalid_type",...}]`)
  was leaking verbatim into the user-visible tool result — confirmed, not
  hypothetical, since it's exactly what surfaced from the bug above.
  `dispatchToolCall` (`agent/src/main/tools/index.ts`) now gives a plain
  fallback message for any `ZodError` instead of its raw `.message`.

## 2026-08-04 — Phase 3 increment 4: `take_screenshot_and_describe`

- **New tool: `take_screenshot_and_describe`.** Captures the primary display
  (Electron `desktopCapturer`, downscaled to ~1280px wide JPEG), sends it to
  a new `POST /vision/describe` endpoint, which calls Groq's
  `llama-3.2-11b-vision-preview` (`server/src/vision.ts`) and returns a text
  description — spoken back to the user like any other tool result. The
  third `sensitivity: "high"` tool, same Allow/Deny gate as `close_app`/
  `read_clipboard`.
- **Deliberately bypasses the WS `tool_call` protocol for the image itself**
  — every other tool's `ToolResult` gets persisted into the `ToolInvocation`
  audit table; a full screen capture durably stored in Postgres forever
  would be a real problem. The image travels only in the one HTTPS request
  to `/vision/describe`; only the resulting text ever becomes a `ToolResult`.
- Fixed a real gotcha this surfaced: `server/src/index.ts` had one global
  `express.json()` with the 100kb default, applied before any router saw the
  request — a base64 screenshot would 413 before a route-local limit could
  help. Scoped `/auth` to keep the small default and gave `/vision` its own
  25MB limit instead of raising the global one.
- `/vision/describe` reuses `checkAndConsumeTurn` (the same daily-cap check
  the WS turn loop uses) so a direct hit against the endpoint can't burn
  through the shared Groq key's quota unbounded.
- Consent screen updated: screenshots are the most sensitive thing shared so
  far (an actual image of your screen going to a cloud model), disclosed
  explicitly, always confirmed first.
- Wired through the same four sync points as every prior tool.
- **Not yet verified:** real screen capture, the HTTP round-trip, and an
  actual Groq vision response — this dev environment is Linux, needs a pass
  on the user's Windows machine.

## 2026-08-04 — Phase 3 increment 3: `read_clipboard`, plus a user-facing capabilities doc

- **New tool: `read_clipboard`.** Reads clipboard text via Electron's built-in
  `clipboard` module (no new dependency), truncated to 4,000 characters. The
  second `sensitivity: "high"` tool — gated by the existing Allow/Deny
  confirmation dialog, but for privacy (clipboard can hold passwords/OTPs),
  not destructiveness like `close_app`. Wired through the usual four sync
  points; consent screen copy generalized to cover both "risky" and
  "privacy-sensitive" confirm-first actions instead of only mentioning
  `close_app`.
- **New:** `docs/CAPABILITIES.md` — a living, plain-language summary of what
  Karvix can actually do today (as opposed to `ROADMAP.md`'s "what's next" or
  this file's dated history). Linked from `docs/README.md`. `ROADMAP.md`'s
  Phase 3 checklist now calls for updating it on every new tool.
- **Deliberately not built this pass:** `take_screenshot_and_describe`
  (needs a vision model + image transport + its own consent treatment — real
  architecture work) and `send_email_draft` (blocked on the user creating a
  Google Cloud OAuth client first, plus its own privacy review). Both need
  their own planning pass, not a rushed bundle with `read_clipboard`.

## 2026-08-04 — Phase 3 increment 2: `control_media` + `set_reminder`

- **New tool: `control_media`.** Play/pause, next/prev, volume, mute —
  simulated via `user32.dll`'s `keybd_event` (global, same as a physical
  multimedia key) through a fixed PowerShell `-Command`, not a native Node
  addon. Deliberately avoids repeating the `onnxruntime-node` prebuilt-binary
  pain from the memory feature.
- **New tool: `set_reminder`.** Relative-delay only (`delayMinutes`, e.g. "in
  10 minutes") — no timezone plumbing yet, so absolute times like "at 6pm"
  aren't supported this increment. Deliberately **client-local**: stored via
  `electron-store` (`agent/src/main/reminders/reminderStore.ts`) and fired by
  an in-process interval through Electron's native `Notification` API
  (`reminderScheduler.ts`) — no new Postgres table, no background poller or
  connection registry on the server. Overdue reminders catch up on next
  launch instead of being lost; known limitation is it only fires if the app
  is running at the time, and there's no cross-device sync yet.
- Wired both through the same four sync points as every prior tool (server
  `toolNames.ts`/`schemas.ts`, agent `toolContract.ts`/`deviceCapabilities.ts`).
- `ToolSchema.parameters.properties` gained an optional `enum` field (used by
  `control_media`'s `action` param) — a stricter JSON schema than a
  free-text description, which should reduce malformed tool-call generations
  for this tool specifically (see the ongoing `tool_use_failed` reliability
  note in `docs/ARCHITECTURE.md`).
- **Not yet verified:** real PowerShell execution and `Notification` behavior
  — this dev environment is Linux, needs a pass on the user's Windows machine.

## 2026-08-04 — Phase 3 increment 1: app control expansion (open + close)

- **`open_app` whitelist widened:** from 6 browser/editor entries to a curated
  list across browsers, editors, Office, media, communication apps (WhatsApp,
  Teams, Slack, Discord, Zoom), and system utilities (camera, file explorer,
  task manager, paint, settings, control panel, terminal, PowerShell). Moved
  into a new shared `agent/src/main/tools/appRegistry.ts` so `open_app` and
  the new `close_app` can't drift into two separate lists.
- **New tool: `close_app`.** Force-closes a whitelisted running app via
  `taskkill /IM <processName> /F` (fixed argv, same `execFile`-not-`exec()`
  rule as every other tool). File Explorer, Settings, and Control Panel are
  deliberately excluded — closing `explorer.exe` takes down the whole
  taskbar/desktop shell, not one window.
- **First real use of `sensitivity: "high"`:** that field sat inert since v1.
  `close_app` is now gated by an Allow/Deny `dialog.showMessageBox` confirmation
  in `dispatchToolCall` before it ever runs — `open_app` is unaffected, still
  immediate. Consent screen copy updated to disclose closing apps.
- Wired `close_app` through the four places that must stay in sync: server
  `toolNames.ts`/`schemas.ts`, agent `toolContract.ts`/`deviceCapabilities.ts`.
- **Not yet verified:** exact `start`/`taskkill` names for less-common apps
  (Slack, Zoom, Notepad++, etc.) — this dev environment is Linux, so real
  execution needs a pass on an actual Windows machine.

## 2026-08-04 — Named the product, fixed real bugs from live testing, shipped Phase 2 memory

- **Named:** the product is now **Karvix** (was the placeholder "Voice Agent").
  Wired through `package.json` (both packages), `electron-builder`'s
  appId/productName, window title, tray tooltip, HTML title, login screen. Also
  fixed `electron-builder.yml`'s GitHub Releases publish config, which still had
  placeholder owner/repo — auto-update would have pointed nowhere.
- **Real bugs found and fixed from actually running this on Windows** (all
  confirmed via live testing, not hypothetical):
  - `npm run dev` never launched Electron at all — only started Vite + `tsc -w`.
  - A CSP meant for the packaged app was blocking Vite's dev-mode inline script
    (React Fast Refresh), causing a blank page in dev.
  - Device tool capabilities were defined client-side but never actually sent to
    the server — every device's capabilities stayed at the default `[]`, so the
    LLM was never offered any tools at all, ever, silently.
  - A race in `MicCapture`: `ondataavailable`'s handler being `async` doesn't
    make the browser wait for it before firing `onstop` — `audio_end` could
    reach the server before an earlier chunk finished sending, corrupting the
    file Whisper received (`"could not process file"`).
  - The model would sometimes verbalize a tool call as literal text (e.g.
    `web_search(query: ...)`) instead of using the structured mechanism, and
    that raw pseudo-code got spoken to the user. Tightened the system prompt and
    added a sanitizer backstop.
  - `agent/tsconfig.json` had no include/exclude, so editors resolved it (not
    the per-target configs) for renderer files, merging Node and DOM globals
    into one program and producing real-looking editor-only type errors. Fixed
    via solution-style project references.
  - Editor-visible bug, same root cause class: connection drops mid-turn never
    reset `micState`, so the UI/mic button could get stuck indefinitely.
- **UI:** replaced the flat text screen with an animated central orb (tried CSS
  gradients first — still read as static; landed on a `<canvas>` particle ring,
  continuous motion in every state including idle), a clickable mic button
  (shares one `toggleMic()` with the hotkey so they can't disagree about
  recording state), tool-activity chips in the conversation (previously
  invisible), and auto-scroll to the latest message.
- **Phase 2 shipped** (see `ROADMAP.md`, `docs/ARCHITECTURE.md` "Memory /
  personalization"): durable conversation/message persistence, a
  server-handled `remember_preference` tool backed by local embeddings
  (`@xenova/transformers`) + Neon `pgvector`, and RAG-style memory retrieval
  folded into the system prompt each turn. Verified end-to-end: real embedding
  generation, real pgvector similarity search (correctly matched a relevant
  fact, correctly returned nothing for an unrelated query), the real Groq model
  actually choosing to call `remember_preference` for a durable-fact statement
  and *not* over-triggering on a one-off request, and the schema migration
  applied cleanly to the real Neon database.
- **Found in the process, not previously known:** Groq's Llama 3.3 has a real,
  non-trivial tool-call generation failure rate (confirmed via repeated testing,
  worse on compound requests) — added automatic retry, which measurably helps
  but doesn't fully eliminate it. Documented as a known limitation, not
  silently papered over.

## 2026-08-03 — v1 scaffold — Multi-tenant pivot + real implementation

**Correcting the record:** the previous entry below (dated the same day) described
a "v0.1 MVP" as done. It never was — no `server/` or `agent/` code existed, only
docs describing a single-user, no-auth, localhost-only design written ahead of any
implementation. That plan has been reconsidered and this entry describes what's
actually been built.

- **Decision:** this is a multi-tenant product from day one — real strangers will
  sign up and use it, not just the developer. That drove every architectural choice
  below.
- **Backend** (`server/`): Express + `ws` on one Fly.io-deployable Node process.
  Email/password auth with JWT access tokens + rotating refresh tokens, one-time
  WS-ticket handshake (keeps the long-lived JWT out of the WS URL). Prisma schema
  on Neon Postgres: `users`, `devices`, `refresh_tokens`, `usage_events`,
  `tool_invocations` (audit log, no transcript content). Per-connection `Session`
  with server-scoped `callId`s (cross-user tool-call leakage is structurally
  impossible, not just policy). Per-user daily Groq usage cap via Upstash Redis,
  with an optional BYOK (bring-your-own-key, AES-256-GCM encrypted) escape valve
  that lifts the cap. Groq Whisper STT + Llama 3.3 tool-calling loop, bounded to 6
  steps per turn.
- **Client** (`agent/`): Electron (contextIsolation + sandbox, no nodeIntegration).
  Login/signup screen, first-run consent screen (separate from the OS mic
  permission dialog), hotkey push-to-talk (`Ctrl+Shift+Space`), streamed opus mic
  capture, browser `SpeechSynthesis` TTS behind a swappable `TtsEngine` interface.
  Reconnect with exponential backoff + manual retry after 5 failed attempts. Tools
  implemented: `open_app` (fixed whitelist map), `web_search`, `open_url`
  (http/https-only scheme validation) — every tool call guarantees a `tool_result`
  even on timeout/throw, so the server's loop never hangs.
- Packaging: `electron-builder` (NSIS) + `electron-updater` via GitHub Releases.
- Both `server/` and `agent/` typecheck and build cleanly (`tsc --noEmit`, `vite
  build`); not yet run end-to-end against real Neon/Upstash/Groq credentials or
  packaged for distribution.
- **Not yet done:** persisted memory/personalization, more tools, better TTS,
  wake-word, task queue, mobile client, Stripe/billing, real Neon/Upstash/Fly
  deployment, code signing, privacy policy/ToS, monitoring (Sentry/uptime).

## 2026-08-03 — v0.1 (superseded, see above) — Initial MVP scaffold
- ~~Project structure created: `server/` (backend brain) + `agent/` (Electron
  hands).~~ *(Never actually created — see the correction above.)*
