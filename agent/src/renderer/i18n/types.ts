// The canonical shape every language dictionary must implement — en.ts is the
// source of truth for both the English copy and this type (every other
// dictionary is typed against it, so a missing key is a compile error, not a
// silent blank string at runtime).
export interface HelpItem {
  examples: string[];
  description: string;
  confirms?: boolean; // mirrors CONFIRMATION_PROMPTS server-side — not translated, just carried through
}

export interface HelpGroup {
  title: string;
  items: HelpItem[];
}

export interface PortalCard {
  title: string;
  examples: string;
  description: string;
}

export interface Dictionary {
  app: {
    loading: string;
    whatCanIAsk: string;
    settingsLink: string;
    micBlocked: string;
    openMicSettings: string;
    continuousSessionHint: string;
  };
  orbLabels: {
    idle: string;
    listening: string;
    thinking: string;
    speaking: string;
  };
  micButton: {
    startTalking: string;
    stopTalking: string;
  };
  statusIndicator: {
    idle: string;
    connecting: string;
    connected: string;
    reconnecting: string;
    error: string;
    retryConnection: string;
  };
  login: {
    subtitle: string;
    logInTab: string;
    signUpTab: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    genericError: string;
    pleaseWait: string;
    needAccount: string;
    alreadyHaveAccount: string;
  };
  consent: {
    heading: string;
    bullets: string[];
    accept: string;
    privacyPolicyLink: string;
  };
  settings: {
    heading: string;
    languageTitle: string;
    languageHint: string;
    languageLabel: string;
    languageError: string;
    groqKeyTitle: string;
    groqKeyHint: string;
    groqKeyLabel: string;
    saving: string;
    saveKey: string;
    groqKeySaved: string;
    groqKeyError: string;
    myAppsTitle: string;
    myAppsHint: string;
    remove: string;
    noneAddedYet: string;
    privacyPolicyLink: string;
    close: string;
  };
  help: {
    heading: string;
    introBeforeHotkey: string;
    introAfterHotkey: string;
    confirmsFirst: string;
    footerHint: string;
    close: string;
    groups: HelpGroup[];
  };
  portal: {
    cards: PortalCard[];
  };
  automation: {
    heading: string;
    starting: string;
    stop: string;
  };
}
