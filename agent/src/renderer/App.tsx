import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { MicCapture, isMicPermissionGranted } from "./audio/micCapture";
import { createTtsEngine } from "./audio/ttsPlayback";
import { ConsentScreen } from "./components/ConsentScreen";
import { LoginScreen } from "./components/LoginScreen";
import { StatusIndicator } from "./components/StatusIndicator";
import { ConversationView } from "./components/ConversationView";
import { SettingsPanel } from "./components/SettingsPanel";
import { VoiceOrb } from "./components/VoiceOrb";

export function App() {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [micPermissionWarning, setMicPermissionWarning] = useState(false);

  const {
    loggedIn,
    connectionStatus,
    micState,
    turns,
    lastError,
    setLoggedIn,
    setConnectionStatus,
    setMicState,
    pushTurn,
    setError,
  } = useAppStore();

  const micCapture = useRef(new MicCapture());
  const ttsEngine = useRef(createTtsEngine());

  useEffect(() => {
    window.jarvis.consent.hasConsented().then(setConsented);
    window.jarvis.auth.getSession().then((s) => setLoggedIn(s.loggedIn));

    isMicPermissionGranted().then((granted) => setMicPermissionWarning(!granted));

    window.jarvis.auth.onSessionChanged((s) => setLoggedIn(s.loggedIn));
    window.jarvis.connection.onStatus((status) => setConnectionStatus(status));

    window.jarvis.conversation.onTranscript((text) => {
      pushTurn({ role: "user", text });
      setMicState("thinking");
    });

    window.jarvis.conversation.onAssistantText((text) => {
      pushTurn({ role: "assistant", text });
      setMicState("speaking");
      ttsEngine.current.speak(text).then(() => setMicState("idle"));
    });

    window.jarvis.conversation.onError((payload) => {
      setError(payload);
      setMicState("idle");
    });

    window.jarvis.hotkey.onToggle((active) => {
      if (active) {
        setMicState("listening");
        micCapture.current.start(() => {
          setMicPermissionWarning(true);
          setMicState("idle");
        });
      } else {
        micCapture.current.stop();
      }
    });
    // Registered once on mount — main process is the single source of truth for
    // these events for the lifetime of the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (consented === null || loggedIn === null) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!consented) {
    return <ConsentScreen onAccept={() => setConsented(true)} />;
  }

  if (!loggedIn) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <header>
        <StatusIndicator
          connectionStatus={connectionStatus}
          onRetry={() => window.jarvis.connection.retryNow()}
        />
        <button className="link-button" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </header>

      {micPermissionWarning && (
        <div className="warning-banner">
          Microphone access is blocked.{" "}
          <button className="link-button" onClick={() => window.jarvis.shell.openMicSettings()}>
            Open Windows mic settings
          </button>
        </div>
      )}

      {lastError && <div className="error-banner">{lastError.message}</div>}

      <div className="orb-stage">
        <VoiceOrb state={micState} />
      </div>

      <ConversationView turns={turns} />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
