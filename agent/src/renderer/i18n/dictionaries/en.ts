import type { Dictionary } from "../types";

// Canonical dictionary — every string here is the exact copy that shipped
// before multi-language support existed, moved out of components verbatim.
// This is also the type-checked source of truth every other language
// dictionary is validated against (see i18n/index.ts).
export const en: Dictionary = {
  app: {
    loading: "Loading…",
    whatCanIAsk: "What can I ask?",
    settingsLink: "Settings",
    micBlocked: "Microphone access is blocked.",
    openMicSettings: "Open Windows mic settings",
    continuousSessionHint: "Session active — press hotkey to end",
  },
  orbLabels: {
    idle: "Press Ctrl+Shift+Space to talk",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  },
  micButton: {
    startTalking: "Start talking",
    stopTalking: "Stop talking",
  },
  statusIndicator: {
    idle: "Not connected",
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    error: "Connection lost",
    retryConnection: "Retry connection",
  },
  login: {
    subtitle: "Sign in to talk to your assistant.",
    logInTab: "Log in",
    signUpTab: "Sign up",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Min 8 characters",
    genericError: "Something went wrong — try again.",
    pleaseWait: "Please wait…",
    needAccount: "Need an account? ",
    alreadyHaveAccount: "Already have an account? ",
  },
  consent: {
    heading: "Before you start",
    bullets: [
      "When you press the hotkey and speak, your audio is sent to our server and processed via Groq to transcribe and understand it.",
      'This app can take real actions on your computer on your behalf — opening and closing apps, controlling media, setting reminders, running web searches, and opening URLs — only from a fixed, safe list your assistant is allowed to use. Actions that are risky (closing an app) or could expose something private (reading your clipboard, taking a screenshot) always ask you out loud to confirm first — just say "yes" on your next turn to allow it, or anything else to cancel.',
      "If you confirm a screenshot, an image of your screen at that moment is sent to a cloud AI model to be described back to you — more sensitive than anything else this app shares, which is why it's never done without asking first.",
      'You can ask it to add your own apps to that list (e.g. "add Photoshop as an app I can open") — it always asks you to confirm first, and you always pick the actual program yourself in a file picker; nothing is ever added automatically.',
      "For tasks that need clicking or typing inside an app (e.g. adding something to a cart, sending a message), it can take screenshots and control your mouse/keyboard step by step — always asks you to confirm first, and again before anything that submits a purchase, sends a message, or deletes something. It uses a free AI model for this, so it can sometimes click the wrong thing; you can say \"stop\" at any point.",
      "This is an early beta. Things may break, and the assistant may occasionally misunderstand you.",
    ],
    accept: "I understand, continue",
    privacyPolicyLink: "Read our Privacy Policy",
  },
  settings: {
    heading: "Settings",
    languageTitle: "Language",
    languageHint:
      "Sets the language Karvix listens in, speaks in, and shows this app in. Limited to the languages our AI model is officially validated on — a wider list would risk silently misunderstanding what you ask.",
    languageLabel: "Language",
    languageError: "Couldn't save that — try again.",
    groqKeyTitle: "Groq API key",
    groqKeyHint: "Hit today's free limit? Add your own free Groq key (console.groq.com) to remove the daily cap entirely.",
    groqKeyLabel: "API key",
    saving: "Saving…",
    saveKey: "Save key",
    groqKeySaved: "Saved — the daily cap no longer applies.",
    groqKeyError: "Couldn't save that key — try again.",
    myAppsTitle: "My apps",
    myAppsHint: 'Apps you\'ve added by asking Karvix (e.g. "add Photoshop as an app I can open"). Only on this device.',
    remove: "Remove",
    noneAddedYet: "None added yet.",
    privacyPolicyLink: "Privacy Policy",
    close: "Close",
  },
  help: {
    heading: "What can Karvix do?",
    introBeforeHotkey: "Press ",
    introAfterHotkey: " from anywhere — no need to switch to this window — say what you want, then press it again to stop.",
    confirmsFirst: "Confirms first",
    footerHint:
      "Windows only for now. Screenshots only see your primary monitor. Reminders and remembered facts don't sync across devices yet.",
    close: "Close",
    groups: [
      {
        title: "Apps",
        items: [
          {
            examples: ['"Open Chrome"', '"Open the camera"', '"Open file explorer"'],
            description:
              "Launches an app from a fixed, safe list — browsers, editors, Office, media, chat apps, and common system tools.",
          },
          {
            examples: ['"Close Chrome"', '"Close Spotify"'],
            description: 'Force-closes a running app from that list — say "yes" on your next turn to actually close it.',
            confirms: true,
          },
          {
            examples: ['"Add Photoshop as an app I can open"'],
            description:
              "Checks your installed apps first (works for Microsoft Store apps too), or opens a file picker if it can't find a clear match — nothing is ever added without you confirming or selecting it. Store apps can only be opened this way, not closed. Manage what you've added in Settings.",
            confirms: true,
          },
        ],
      },
      {
        title: "Media & reminders",
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
        items: [
          { examples: ['"Search for the best pizza in Ahmedabad"'], description: "Opens a web search in your default browser." },
          { examples: ['"Open example.com"'], description: "Opens a specific URL in your default browser." },
        ],
      },
      {
        title: "Privacy-sensitive",
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
        items: [
          {
            examples: ['"I prefer Chrome over Edge"', '"I live in Ahmedabad"'],
            description:
              "May remember something you say as a lasting fact and bring it up later — only when it decides it's clearly worth it, not a passive transcript scan.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "Apps",
        examples: '"Open Chrome" · "Close Spotify"',
        description: "Launches whitelisted apps. Closing or adding a new one confirms with you first.",
      },
      {
        title: "Media & reminders",
        examples: '"Pause the music" · "Remind me in 20m"',
        description: "System-wide playback controls and local desktop notifications.",
      },
      {
        title: "Context aware",
        examples: '"Describe my screen"',
        description: "Reads your clipboard or analyzes your primary monitor — asks to confirm first.",
      },
      {
        title: "Search & memory",
        examples: '"Search for pizza" · "I like Ubuntu"',
        description: "Opens web searches in your browser and remembers durable facts you tell it.",
      },
    ],
  },
  automation: {
    heading: "Working on it",
    starting: "Taking a look at your screen…",
    stop: "Stop",
  },
};
