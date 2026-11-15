# Karvix 2 — Full PC control by voice + human voice (plan)

Status: **approved 2026-11-14 — Phase 0 (voice) done; Phase 1 (agent kernel v2) done 2026-11-15; Phases 2-5 built (see CHANGELOG 2026-11-15); Phase 6 polish and Windows verification pending.** Supersedes the "Phase 4 Browser Agent" and
"Phase 5 Computer Use hardening" entries in `IMPLEMENTATION_ROADMAP.md` once approved.

Goal: the user can operate their whole PC by voice — open/edit/save files, use any app, shop online,
send messages — and the agent completes it **correctly**, asks when unsure, and never does anything
irreversible without the user's say-so. Plus: replace the robotic voice with a natural one.

---

## 1. Why today's computer-use doesn't work (verified in code, 2026-11-14)

| Problem | Where | Effect |
|---|---|---|
| Linux automation is hard-disabled on Wayland (Ubuntu's default) and needs `xdotool`, which isn't installed by default | `agent/src/main/tools/computerUse/inputSim.linux.ts` | On the developer's own laptop, computer-use can never run |
| Screen capture uses `desktopCapturer` without Wayland/PipeWire handling | `computerUse/screenshotStep.ts` | Screenshots fail or need a picker every time on Wayland |
| A general vision model guesses **raw pixel coordinates** from a 1280px-downscaled screenshot | `server/src/automation/vision.ts` | Misclicks; pixel grounding is the weakest skill of general VLMs |
| Tiny action set: click / type / single key / scroll | `protocol.ts` `AutomationAction` | No Ctrl+S, double/right-click, drag, wait-for-load, window focus, app launch — Notepad "save" alone needs workarounds |
| No structured view of the screen (no accessibility tree, no window list, no focused element) | — | The model can't know button names, field values, or which app is in front |
| No verification after a step; failure = "ok:false" text only | `automation/runner.ts` | Silent wrong outcomes, loops, "done" claims that aren't true |
| 15 steps / 3 min cap, one task at a time, no clarification mid-task | `runner.ts` | Real tasks (shopping) run out; can't ask "which file?" |
| Robotic voice: Linux falls back to `spd-say`/espeak-ng | `main/tts/nativeTts.ts` | The "annoying" voice |

**Conclusion:** this is an architecture problem, not a bug list. Pixels-only control is the least
reliable way to drive a computer; every serious system (Microsoft UFO², Windows-MCP, OSWorld top
entries) reads the OS accessibility tree first and uses vision only as a fallback.

---

## 2. Use-case catalog (what "anything" has to mean)

Each category lists the route the agent should prefer (see §3). ✋ = needs explicit confirmation.

1. **Apps & windows** — open/close/switch/minimize/maximize, "put Chrome on the left half", "close all
   windows". *Route: OS APIs + accessibility.*
2. **Files & text** — "open notepad, open notes.txt, add 'buy milk' at the end, save, close"; new file;
   rename/move/copy/delete ✋ files; find a file; zip. *Route: deterministic file skills (Node `fs`,
   sandboxed to user folders), then show the result in the app; GUI only if the user insists on the app.*
3. **Office-style editing** — Word/LibreOffice/Excel: write a paragraph, fill a cell range, export PDF.
   *Route: accessibility (UIA/AT-SPI) for the app; file-format libraries where faster.*
4. **Browser & web** — search and *read* results, fill forms, log in (user types passwords), compare
   products, **shopping up to the final Place-Order ✋**. *Route: dedicated "Karvix browser profile"
   driven via Playwright/CDP (DOM, not pixels).*
5. **Messaging** — WhatsApp, Telegram, email, Slack: "message Mom 'I'm late'" — read back the exact text
   and recipient, **Send ✋**. *WhatsApp: official `wa.me` click-to-chat link (prefills text) in the
   desktop app/WhatsApp Web; never unofficial APIs (ban risk).*
6. **System settings** — volume, brightness, Wi-Fi/Bluetooth on/off, dark mode, do-not-disturb,
   default apps. *Route: deterministic OS skills per platform.*
7. **Media** — play/pause/next, "play lo-fi on YouTube", Spotify. *Route: media keys / app skills / browser.*
8. **Cross-app workflows** — "copy the table from this page into a new Excel sheet", "attach the latest
   download to an email to X". *Route: planner chains the above; clipboard skill.*
9. **Reading the screen** — "what does this error say?", "summarize this page". *Route: accessibility
   text first, screenshot+vision fallback (confirmation as today).*
10. **Recovery situations the agent must handle** — pop-ups/cookie banners, slow loads (wait-for),
    "Save changes?" dialogs, file-already-exists, app not installed, logged-out sites, element not found,
    window off-screen, multiple monitors, wrong language UI.
11. **Must stop and hand over to the user** — passwords/OTP/2FA, CAPTCHAs, payment details, UAC/admin
    prompts (Windows blocks input into elevated windows anyway), anything ambiguous ("which Mom?").
12. **Conversation during a task** — "stop", "wait", "no, the other file", "also make it bold"; the agent
    narrates briefly ("Opening Notepad… saved.") and asks short questions when needed.

Explicit non-goals: games, drawing/precise graphics work, bypassing CAPTCHAs/2FA, entering secrets,
completing payments without a spoken + on-screen confirmation.

---

## 3. Architecture: route by task, pixels last

```
voice ─► STT ─► PLANNER (server LLM tool loop)
                  │ chooses the most structured route per step
                  ├─ A. Skills (deterministic): files, apps, windows, settings, clipboard, media, wa.me
                  ├─ B. Accessibility: Windows UI Automation / Linux AT-SPI2 (element ids, SetText, Invoke)
                  ├─ C. Browser: Playwright/CDP on a dedicated Karvix Chrome profile (DOM + a11y tree)
                  └─ D. Vision fallback: screenshot (+ numbered marks) → computer-use model
                  ▼
           EXECUTOR (Electron main, per-OS)  ─► VERIFY (state diff) ─► next step / retry / ask user
                  ▲
           SAFETY GATE (client-side, deterministic) — blocks send/buy/delete/submit/credentials until
           the user confirms by voice + on screen, with the exact payload read back
```

### 3.1 Observation ("what's on screen") — new
Each step the client returns a compact, structured state instead of only a picture:
foreground app + window title, open windows, the focused element, and a **pruned accessibility tree with
short ids** (`[12] Button "Save"`, `[13] Edit "File name" = "notes.txt"`). A screenshot is attached only
when the tree is insufficient (canvas apps, custom UIs) — then with numbered marks drawn on detected
elements so the model picks an id, not a pixel.

### 3.2 Action space — new, typed
`launch_app, focus_window, window(op), click(id|xy, button, double), set_text(id, text),
type_text(text), hotkey(["ctrl","s"]), scroll(id|xy, dir, amount), drag(from,to), wait_for(condition,
timeout), file.read/write/append/move/copy/delete(path), clipboard.get/set, browser.goto/click/fill/
select/read, ask_user(question), done(summary), fail(reason)`.
Every action carries a `risk` the **client recomputes deterministically** (it never trusts the model's
own label for buy/send/delete/submit/credential actions).

### 3.3 Verification & recovery — new
After each action the executor re-observes and checks the expected change (window opened, text present,
file saved, URL changed). Failure → one retry with a fresh observation → re-plan → after N failures,
escalate model (§5) or ask the user. "done" is only accepted if the verifier agrees.

### 3.4 Platform executors
- **Windows**: a small bundled helper (C#/.NET, ships inside the installer) exposing UI Automation,
  window management, SendInput and screenshots over stdio JSON. Faster and far more capable than one
  PowerShell process per action (today's approach). UIA can't drive elevated (admin) windows — disclosed.
- **Linux X11**: AT-SPI2 over D-Bus from Node + `xdotool` (installer/first-run check) + X capture.
- **Linux Wayland (GNOME/Ubuntu default)**: xdg-desktop-portal **RemoteDesktop + ScreenCast** (one
  consent dialog at onboarding, persisted restore token; re-consent flow when it expires) for input and
  frames; AT-SPI **actions** (DoAction/SetText) because Wayland exposes no global coordinates. `ydotool`
  is rejected (needs root/udev; effectively a keylogger permission).
- **Browser**: Playwright-core driving a **dedicated Karvix Chrome profile** (Chrome ≥136 ignores remote
  debugging on the default profile). The user signs into sites/WhatsApp Web once in that profile.

### 3.5 Safety (non-negotiable for a product that can buy and send)
Screen content is untrusted (published research shows 50–90% attack success of on-screen prompt
injection against computer-use agents). So:
- Deterministic client-side classifier for send/buy/pay/delete/submit/credential/permission actions →
  hard stop, spoken + on-screen confirmation with the exact payload ("Send 'I'm late' to Mom (+91…)?").
- The agent never types passwords, OTPs or card numbers; it hands control to the user and resumes.
- Per-task budgets (steps, minutes, cost); domain/app allowlist for a task; file skills limited to user
  folders, deletes go to Trash.
- Always-visible "Karvix is controlling your PC" overlay + global hotkey abort (today's hotkey).
- Audit log of every action (no screenshots stored, as today).
- Text read from the screen is passed to the model as quoted data, never as instructions.

---

## 4. Human voice

Today: browser voice on Windows, espeak on Linux (robotic). Replace with **server-side neural TTS**
streamed to the client as `assistant_audio` (already reserved in the protocol), cut at sentence
boundaries so speech starts after the first sentence.

| Option | Langs (of our 8) | Price | Notes |
|---|---|---|---|
| **Google Chirp 3 HD — recommended** | all 8 incl. Hindi & Thai | 1M chars/month free, then ~$30/1M | streaming; ~4–6K replies/month free |
| Azure Neural/HD | all 8 | 0.5M free/month, ~$15–22/1M (unverified) | good alternative |
| Cartesia Sonic 3.6 | all 8 | ~$38–65/1M | most natural tier, pricier |
| ElevenLabs Flash | no Thai | $40/1M | best English latency |
| Kokoro (local, Apache-2.0) | en es fr hi it pt (no de/th) | free | **offline/over-quota fallback** in the client |

Rejected: edge-tts (unofficial Microsoft endpoint, ToS risk), XTTS/F5 (non-commercial licenses),
OpenAI TTS (models deprecated 2027-01-06), Groq Orpheus (English/Arabic only).
Cache fixed phrases (confirmations, errors) so they cost nothing and play instantly.

---

## 5. Models

- **Planner**: keep `openai/gpt-oss-120b` (Groq) for the tool loop; it now plans over structured
  observations, which suits text models.
- **Vision fallback**: `qwen/qwen3.8-27b` on Groq (already used; vendor-reported strong OSWorld score,
  cheap, fast) — the failure today is the *architecture*, not only the model. **Escalation** to Claude
  Sonnet 5.5 computer-use ($2/$10 per MTok) after repeated failures or for long tasks — optional, paid.
- **Before committing**: build an eval set of ~30 real tasks (the catalog above) and measure success,
  steps, latency and cost per route/model. All public benchmark numbers are self-reported.

Rough cost per vision-heavy 20-step task (estimate): Qwen on Groq ~$0.05–0.15; Sonnet ~$0.10–0.30.
Structured routes (skills/accessibility/browser DOM) are mostly text and far cheaper.

---

## 6. Phased build (each phase ships and is testable on its own)

| Phase | What | Exit criteria |
|---|---|---|
| **0. Voice** (quick win) | Server TTS (Chirp 3 HD) → `assistant_audio`, sentence streaming, phrase cache, Kokoro offline fallback | Natural voice in all 8 languages on Windows + Linux; first audio < ~1.5s after reply text |
| **1. Agent kernel v2 + eval** | New observation/action protocol, verify-retry-replan loop, `ask_user` mid-task, budgets, safety gate + overlay, eval harness with ~30 tasks | Harness runs; safety gate unit-tested; old automation path still works behind a flag |
| **2. Skills + Windows accessibility** | File/app/window/settings/clipboard skills; Windows UIA helper | Notepad open/edit/save/close, file ops, settings tasks ≥90% on the eval (Windows) |
| **3. Browser route** | Playwright + dedicated profile, DOM actions, login hand-off, shopping up to confirm, `wa.me` messaging | Search-and-read, form fill, add-to-cart→confirm, WhatsApp prefilled send ≥80% |
| **4. Linux (X11 + Wayland)** | AT-SPI executor, portal RemoteDesktop/ScreenCast with consent + token | Same Notepad/file/browser tasks on Ubuntu 24.04 Wayland |
| **5. Vision fallback 2.0** | Numbered marks, new action space, Claude escalation, prompt-injection red-team tests | Canvas/custom-UI tasks complete; injection test suite passes (no unconfirmed send/buy) |
| **6. Polish** | Barge-in ("stop"/"wait"), progress narration, cross-app workflows, per-user app memory | Dogfooding by the team for a week without blockers |

Honest timeline: Phase 0 is days; Phases 1–3 are several weeks of work; 4–6 follow. Each phase is
reviewed (tool-safety-reviewer, contract-sync-checker) and verified on real machines before the next.

---

## 7. Risks

- Benchmark scores are self-reported; Groq preview models can be withdrawn → the eval harness and the
  escalation path are the mitigation.
- Wayland consent prompts / token expiry → clear onboarding + re-consent UX; X11 path as backup.
- WhatsApp ToS → only official click-to-chat + user-confirmed send; no unofficial APIs.
- Prompt injection leading to purchases/messages → deterministic client gate, never trust model risk labels.
- Render free tier (sleeps, ~1 min cold start) hurts a "talk to your PC" product → paid instance before launch.
- Unsigned Windows installer → code signing before wide release.

## 8. Decisions (product owner, 2026-11-14)

1. **Models:** Groq is the default and the system **never switches models automatically**. Users may add
   their own API keys for other providers (e.g. Anthropic, OpenAI, Google) in Settings and explicitly choose
   that model — bring-your-own-key, same pattern as today's BYOK Groq key. (§5's "automatic escalation to
   Claude" is therefore replaced by user-selected models.)
2. **Voice:** ~~Google Chirp 3 HD~~ — **revised the same day: no account/key configuration wanted.** Default is a
   **local natural voice** (Kokoro, Apache-2.0, via sherpa-onnx) downloaded automatically on first launch; it
   covers English. Other languages use the system voice until free Piper voices (license-checked) are added;
   no free natural Thai voice exists. The Google path stays in the code but is inactive without a key.
3. **Platform:** Windows and Linux (X11 + Wayland) are built **together** (Phases 2 and 4 run in parallel).
4. **Go-ahead:** Phase 0 (voice) now, then Phase 1 (agent kernel v2 + eval). Each phase is reviewed by the
   product owner before the next starts.

## 9. Status at 2026-11-15 (honest)

| Phase | State |
|---|---|
| 0 Voice | Done, shipped |
| 1 Kernel + safety + eval | Done (eval 15/16, voice e2e 3/3) |
| 2 Skills + app control | Linux done and tested; Windows UIA written, UNTESTED (CI smoke test added) |
| 3 Browser / shopping | Done against a local mock shop (real planner); WhatsApp untested (needs an account) |
| 4 Linux Wayland | Done: keyboard + screen frames via the RemoteDesktop/ScreenCast portal; focus guards |
| 5 Vision fallback | `screen look` done; vision CLICKING off (measured 1/3 accurate); bring-your-own-model done (fake-network tests only) |
| 6 Polish | Not started: voice "stop" while working, progress narration, cross-app memory |

Known limits: the free Groq key (~200K tokens/day) caps testing and production use; vision grounding with the current model is
unreliable; the Wayland permission dialog needs one tick ("Allow Remote Interaction") that is off by default.
