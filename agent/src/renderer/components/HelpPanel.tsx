interface CapabilityEntry {
  examples: string[];
  description: string;
}

// The end-user-facing version of docs/CAPABILITIES.md — that file lives in
// the repo, which an actual installed-app user never sees. Keep these two in
// sync by hand whenever a tool ships or changes; ROADMAP.md's per-tool
// checklist calls for updating both, not just this one.
const CAPABILITIES: CapabilityEntry[] = [
  {
    examples: ['"Open Chrome"', '"Open the camera"', '"Open file explorer"'],
    description:
      "Launches an app from a fixed, safe list — browsers, editors, Office, media, chat apps, and common system tools.",
  },
  {
    examples: ['"Close Chrome"', '"Close Spotify"'],
    description:
      'Force-closes a running app from that list. Always asks you out loud to confirm first — say "yes" on your next turn to actually close it.',
  },
  {
    examples: ['"Search for the best pizza in Ahmedabad"'],
    description: "Opens a web search in your default browser.",
  },
  {
    examples: ['"Open example.com"'],
    description: "Opens a specific URL in your default browser.",
  },
  {
    examples: ['"Pause the music"', '"Turn the volume up"', '"Skip this song"'],
    description: "Controls whatever's currently playing, no matter which app has focus.",
  },
  {
    examples: ['"Remind me to call mom in 20 minutes"'],
    description:
      'Sets a reminder that shows as a notification after that delay. Only understands relative delays ("in 20 minutes"), not clock times ("at 6pm") yet — and needs the app running to fire.',
  },
  {
    examples: ['"What\'s on my clipboard?"'],
    description: "Reads your current clipboard text. Always asks you out loud to confirm first.",
  },
  {
    examples: ['"What does this error say?"', '"Describe what\'s on my screen"'],
    description:
      "Takes a screenshot of your primary monitor and describes it back to you. Always asks you out loud to confirm first — this is the most sensitive thing Karvix can access.",
  },
  {
    examples: ['"I prefer Chrome over Edge"', '"I live in Ahmedabad"'],
    description:
      "Karvix may remember something you say as a lasting fact and bring it up again in later conversations, when it decides it's clearly worth remembering.",
  },
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-panel">
      <h2>What can Karvix do?</h2>
      <p className="hint">
        Press <strong>Ctrl+Shift+Space</strong> from anywhere — you don't need to switch to this window — say
        what you want, then press it again to stop. Actions that could lose work or share something private
        always ask you out loud to confirm first; just say "yes" on your next turn to allow them.
      </p>
      <ul className="help-list">
        {CAPABILITIES.map((c) => (
          <li key={c.examples[0]} className="help-item">
            <div className="help-examples">{c.examples.join(" · ")}</div>
            <div className="help-desc">{c.description}</div>
          </li>
        ))}
      </ul>
      <p className="hint">
        Windows only for now. Screenshots only see your primary monitor. Reminders and remembered facts don't
        sync across devices yet.
      </p>
      <button className="link-button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
