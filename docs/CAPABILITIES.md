# What Karvix can actually do right now

A living, user-facing summary of shipped functionality — not what's planned
(`ROADMAP.md`), not why it's built this way (`docs/ARCHITECTURE.md`), not a
dated history (`docs/CHANGELOG.md`). Just: what works today, if you talk to
it right now. Update this file in the same change as any new/changed tool or
capability — this is the checklist item `ROADMAP.md`'s Phase 3 section
already calls for on every increment.

## Talking to it

- **Hotkey:** `Ctrl+Shift+Space`, system-wide — works from any app, you don't
  need to switch to the Karvix window first. Press to start, press again to
  stop; Karvix's window is never auto-raised, so whatever you were looking at
  stays on screen and in focus.
- There's also a clickable mic button inside the Karvix window itself — that
  one does need the window visible.
- Replies are spoken aloud (browser speech synthesis today — a more natural
  TTS engine is planned, see `ROADMAP.md` Phase 4).

## Things it can do (tools)

| Say something like... | What happens |
|---|---|
| "Open Chrome" / "Open the camera" / "Open file explorer" | Launches one of a fixed set of whitelisted apps — browsers, editors, Office, Spotify/VLC, WhatsApp/Teams/Slack/Discord/Zoom, camera, file explorer, task manager, paint, settings, control panel, terminal, PowerShell, and a few more. Full list: `agent/src/main/tools/appRegistry.ts`. |
| "Close Chrome" / "Close Spotify" | Force-closes a running app from that same list — **always asks you to confirm first** with an Allow/Deny popup, since this can lose unsaved work. File Explorer, Settings, and Control Panel can never be closed this way (closing them would take down the whole desktop shell, not just one window). |
| "Search for the best pizza in Ahmedabad" | Opens a web search in your default browser. It only opens the tab — the assistant never reads the results back into the conversation. |
| "Open example.com" | Opens a specific URL in your default browser. |
| "Pause/play the music" / "Skip this song" / "Turn the volume up" / "Mute" | Simulates the actual media keys, so it works no matter which app is currently playing audio. |
| "Remind me to call mom in 20 minutes" | Sets a reminder that fires as a desktop notification after that delay. Only understands **relative** delays ("in 20 minutes," "in 2 hours") — not "at 6pm" yet, since nothing tells it your timezone. Stored only on this device: it needs the app running (the system tray counts) at fire time, doesn't sync to other devices, and if the app was fully closed when a reminder was due, it fires as soon as you reopen it instead of being lost. |
| "I prefer Chrome over Edge" / "I live in Ahmedabad" | The assistant may explicitly choose to remember something you said as a durable fact, and bring it back up in later conversations (semantic recall, not literal keyword match). It only remembers when it decides something is clearly worth it — not a passive transcript scan of everything you say. |
| "What's on my clipboard?" / "Can you fix the grammar in what I copied?" | Reads your current clipboard text and shares it with the assistant — **always asks you to confirm first**, since clipboard contents can be private (passwords, OTPs, anything). Long content gets truncated to 4,000 characters. |

## Accounts & limits

- Real accounts (email/password signup), your data isolated per user.
- A free daily usage cap on the shared Groq key; add your own Groq API key in
  Settings for unlimited use (no billing/subscription in v1).
- First-run consent screen discloses: your audio goes to Groq for
  transcription, and the assistant can take the real actions listed above
  from a fixed, safe list — nothing outside it.

## Known gaps, today

- Windows only.
- No screen/vision capability yet — it can't see or describe what's on your
  screen (planned: `take_screenshot_and_describe`, not yet built — see
  `ROADMAP.md`).
- Reminders and preferences don't sync across multiple devices.
- No email, calendar, or clipboard access yet.

For what's coming next, see `ROADMAP.md`. For why any of this is built the
way it is, see `docs/ARCHITECTURE.md`.
