import { BotAvatar } from "./BotAvatar";

interface CapabilityEntry {
  examples: string[];
  description: string;
  confirms?: boolean; // mirrors CONFIRMATION_PROMPTS in server/src/tools/schemas.ts
}

interface CapabilityGroup {
  title: string;
  icon: JSX.Element;
  items: CapabilityEntry[];
}

// Small line icons, one per group — same stroke weight/rounding as the bot
// avatar and the orb's own SVG details, so this screen reads as the same
// drawn system rather than a separate style bolted on. The "Memory" icon
// deliberately reuses the exact node-and-line constellation from the orb's
// core (VoiceOrb.tsx) — same motif, same meaning, wherever it shows up.
const ICONS = {
  apps: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <line x1="3.5" y1="9.2" x2="20.5" y2="9.2" />
    </svg>
  ),
  media: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5a5 5 0 0 0-5 5v3.3L5.3 15h13.4L17 11.8V8.5a5 5 0 0 0-5-5z" />
      <path d="M9.6 18a2.4 2.4 0 0 0 4.8 0" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2 19 6v5.5c0 4.6-3 7.6-7 8.8-4-1.2-7-4.2-7-8.8V6z" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.9}>
      <line x1="6" y1="7" x2="12" y2="14" />
      <line x1="18" y1="9" x2="12" y2="14" />
      <line x1="12" y1="14" x2="9" y2="19" />
      <circle cx="6" cy="7" r={1.7} fill="currentColor" stroke="none" />
      <circle cx="18" cy="9" r={1.7} fill="currentColor" stroke="none" />
      <circle cx="9" cy="19" r={1.7} fill="currentColor" stroke="none" />
    </svg>
  ),
};

// The end-user-facing version of docs/CAPABILITIES.md — that file lives in
// the repo, which an actual installed-app user never sees. Keep these two in
// sync by hand whenever a tool ships or changes; ROADMAP.md's per-tool
// checklist calls for updating both, not just this one.
const GROUPS: CapabilityGroup[] = [
  {
    title: "Apps",
    icon: ICONS.apps,
    items: [
      {
        examples: ['"Open Chrome"', '"Open the camera"', '"Open file explorer"'],
        description: "Launches an app from a fixed, safe list — browsers, editors, Office, media, chat apps, and common system tools.",
      },
      {
        examples: ['"Close Chrome"', '"Close Spotify"'],
        description: 'Force-closes a running app from that list — say "yes" on your next turn to actually close it.',
        confirms: true,
      },
      {
        examples: ['"Add Photoshop as an app I can open"'],
        description:
          "Opens a file picker so you pick the real program yourself — nothing is ever added without you selecting it. Then open/close it by name like any built-in app. Manage what you've added in Settings.",
        confirms: true,
      },
    ],
  },
  {
    title: "Media & reminders",
    icon: ICONS.media,
    items: [
      {
        examples: ['"Pause the music"', '"Turn the volume up"', '"Skip this song"'],
        description: "Controls whatever's currently playing, no matter which app has focus.",
      },
      {
        examples: ['"Remind me to call mom in 20 minutes"'],
        description:
          'Fires as a desktop notification after that delay. Only relative delays ("in 20 minutes"), not clock times ("at 6pm") yet — and needs the app running to go off.',
      },
    ],
  },
  {
    title: "Web",
    icon: ICONS.web,
    items: [
      { examples: ['"Search for the best pizza in Ahmedabad"'], description: "Opens a web search in your default browser." },
      { examples: ['"Open example.com"'], description: "Opens a specific URL in your default browser." },
    ],
  },
  {
    title: "Privacy-sensitive",
    icon: ICONS.privacy,
    items: [
      {
        examples: ['"What\'s on my clipboard?"'],
        description: "Reads your current clipboard text and shares it with the assistant.",
        confirms: true,
      },
      {
        examples: ['"What does this error say?"', '"Describe what\'s on my screen"'],
        description: "Screenshots your primary monitor and describes it back — the most sensitive thing Karvix can access.",
        confirms: true,
      },
    ],
  },
  {
    title: "Memory",
    icon: ICONS.memory,
    items: [
      {
        examples: ['"I prefer Chrome over Edge"', '"I live in Ahmedabad"'],
        description: "May remember something you say as a lasting fact and bring it up later — only when it decides it's clearly worth it, not a passive transcript scan.",
      },
    ],
  },
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-panel">
      <div className="help-hero">
        <BotAvatar size="lg" />
        <h2 className="wordmark">What can Karvix do?</h2>
        <p className="hint help-intro">
          Press <strong>Ctrl+Shift+Space</strong> from anywhere — no need to switch to this window — say what you
          want, then press it again to stop.
        </p>
      </div>

      <div className="help-groups">
        {GROUPS.map((group) => (
          <section key={group.title} className="help-group">
            <div className="help-group-head">
              <span className="help-group-icon">{group.icon}</span>
              <span className="help-group-title">{group.title}</span>
            </div>
            {group.items.map((item) => (
              <div key={item.examples[0]} className="help-card">
                <div className="help-card-top">
                  <span className="help-examples">{item.examples.join(" · ")}</span>
                  {item.confirms && <span className="confirm-pill">Confirms first</span>}
                </div>
                <p className="help-desc">{item.description}</p>
              </div>
            ))}
          </section>
        ))}
      </div>

      <p className="hint">
        Windows only for now. Screenshots only see your primary monitor. Reminders and remembered facts don't sync
        across devices yet.
      </p>
      <button className="link-button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
