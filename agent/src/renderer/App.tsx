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
import { MicButton } from "./components/MicButton";

const TOOL_LABELS: Record<string, string> = {
  open_app: "Open app",
  web_search: "Web search",
  open_url: "Open URL",
};

function describeTool(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

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
    window.jarvis.auth.getSession().then((s) => setLoggedIn(s.loggedIn));

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
      ttsEngine.current.speak(text).then(() => {
        setMicState("idle");
        window.jarvis.conversation.setActive(false);
      });
    });

    window.jarvis.conversation.onError((payload) => {
      setError(payload);
      setMicState("idle");
      window.jarvis.conversation.setActive(false);
    });

    // Tool execution was previously invisible in the UI — the client would open
    // Chrome and search, but nothing in the conversation ever showed that it
    // happened. Surface it as a compact inline chip between the turns it
    // belongs to (see ConversationView.tsx).
    window.jarvis.conversation.onToolActivity(({ name, result }) => {
      pushTurn({ role: "tool", text: `${result.ok ? "✓" : "✗"} ${describeTool(name)} — ${result.message}` });
    });

    window.jarvis.hotkey.onPress(toggleMic);
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
        <MicButton micState={micState} onClick={toggleMic} />
      </div>

      <ConversationView turns={turns} />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
