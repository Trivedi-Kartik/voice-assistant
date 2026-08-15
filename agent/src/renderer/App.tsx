import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { MicCapture, isMicPermissionGranted } from "./audio/micCapture";
import { createTtsEngine } from "./audio/ttsPlayback";
import { ConsentScreen } from "./components/ConsentScreen";
import { LoginScreen } from "./components/LoginScreen";
import { StatusIndicator } from "./components/StatusIndicator";
import { ConversationView } from "./components/ConversationView";
import { PortalGrid } from "./components/PortalGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { HelpPanel } from "./components/HelpPanel";
import { VoiceOrb } from "./components/VoiceOrb";
import { BotMascot } from "./components/BotMascot";
import { MicButton } from "./components/MicButton";
import { Particles } from "./components/Particles";
import { useDictionary } from "./i18n";
import type { MicState } from "./state/store";

export function App() {
  const t = useDictionary();
  const ORB_LABELS: Record<MicState, string> = t.orbLabels;
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [micPermissionWarning, setMicPermissionWarning] = useState(false);

  const {
    loggedIn,
    connectionStatus,
    micState,
    turns,
    lastError,
    setLoggedIn,
    setLanguage,
    setConnectionStatus,
    setMicState,
    pushTurn,
    setError,
  } = useAppStore();

  const micCapture = useRef(new MicCapture());
  const ttsEngine = useRef(createTtsEngine());

  // Single toggle used by BOTH the hotkey and the mic button, so there is one
  // source of truth for "are we currently recording" — reads the store directly
  // (not the destructured `micState` above) since this is called from an event
  // handler registered once on mount, where a closed-over value would go stale.
  function toggleMic() {
    const current = useAppStore.getState().micState;
    if (current === "idle") {
      setMicState("listening");
      window.jarvis.conversation.setActive(true);
      micCapture.current.start(() => {
        setMicPermissionWarning(true);
        setMicState("idle");
        window.jarvis.conversation.setActive(false);
      });
    } else if (current === "listening") {
      micCapture.current.stop();
      // setActive(false) happens once assistant_text/error actually arrives
      // (see below) — the turn is still in flight (thinking) after this stop.
    }
    // "thinking"/"speaking": ignore — MicButton is disabled in those states.
  }

  useEffect(() => {
    window.jarvis.consent.hasConsented().then(setConsented);
    window.jarvis.auth.getSession().then((s) => {
      setLoggedIn(s.loggedIn);
      setLanguage(s.language);
    });

    isMicPermissionGranted().then((granted) => setMicPermissionWarning(!granted));

    window.jarvis.auth.onSessionChanged((s) => setLoggedIn(s.loggedIn));
    window.jarvis.connection.onStatus((status) => {
      setConnectionStatus(status);
      // If the connection itself is the problem, no server response
      // (transcript/assistant_text/error) is ever coming to reset micState —
      // without this, an in-flight turn gets stuck showing "listening"/
      // "thinking" forever, and audio_chunk/audio_end silently no-op into a
      // dead socket with zero feedback to the user.
      if (status === "reconnecting" || status === "error") {
        if (useAppStore.getState().micState !== "idle") {
          micCapture.current.stop();
          setMicState("idle");
          window.jarvis.conversation.setActive(false);
        }
      }
    });

    window.jarvis.conversation.onTranscript((text) => {
      pushTurn({ role: "user", text });
      setMicState("thinking");
    });

    window.jarvis.conversation.onAssistantText((text) => {
      pushTurn({ role: "assistant", text });
      setMicState("speaking");
      ttsEngine.current.speak(text, useAppStore.getState().language).then(() => {
        setMicState("idle");
        window.jarvis.conversation.setActive(false);
      });
    });

    window.jarvis.conversation.onError((payload) => {
      setError(payload);
      setMicState("idle");
      window.jarvis.conversation.setActive(false);
    });

    window.jarvis.hotkey.onPress(toggleMic);
    // Registered once on mount — main process is the single source of truth for
    // these events for the lifetime of the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rendered behind every screen (loading/consent/login/main), not just the
  // main shell — the ambient backdrop is part of the app's identity, not
  // something that only shows up once you're logged in.
  const aurora = (
    <div className="aurora">
      <Particles />
    </div>
  );

  if (consented === null || loggedIn === null) {
    return (
      <>
        {aurora}
        <div className="app-loading">{t.app.loading}</div>
      </>
    );
  }

  if (!consented) {
    return (
      <>
        {aurora}
        <ConsentScreen onAccept={() => setConsented(true)} />
      </>
    );
  }

  if (!loggedIn) {
    return (
      <>
        {aurora}
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      {aurora}
      <div className="app-shell">
        <header>
          <div className="wordmark">Karvix</div>
          <StatusIndicator
            connectionStatus={connectionStatus}
            onRetry={() => window.jarvis.connection.retryNow()}
          />
          <div className="header-links">
            <button className="link-button" onClick={() => setShowHelp(true)}>
              {t.app.whatCanIAsk}
            </button>
            <button className="link-button" onClick={() => setShowSettings(true)}>
              {t.app.settingsLink}
            </button>
          </div>
        </header>

        {micPermissionWarning && (
          <div className="warning-banner">
            {t.app.micBlocked}{" "}
            <button className="link-button" onClick={() => window.jarvis.shell.openMicSettings()}>
              {t.app.openMicSettings}
            </button>
          </div>
        )}

        {lastError && <div className="error-banner">{lastError.message}</div>}

        <div className="orb-stage">
          <div className="orb-click-wrap">
            <VoiceOrb state={micState} />
            <MicButton micState={micState} onClick={toggleMic} />
            <BotMascot />
          </div>
          <div className={`orb-label${micState !== "idle" ? " active" : ""}`}>
            <span className="dot" />
            <span>{ORB_LABELS[micState]}</span>
          </div>
        </div>

        {turns.length === 0 ? <PortalGrid /> : <ConversationView turns={turns} />}

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      </div>
    </>
  );
}
