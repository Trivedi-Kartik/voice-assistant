import { useEffect, useRef, useState } from "react";
import { useAppStore } from "./state/store";
import { MicCapture, isMicPermissionGranted } from "./audio/micCapture";
import { createTtsEngine } from "./audio/ttsPlayback";
import { SilenceDetector } from "./audio/silenceDetector";
import { ConsentScreen } from "./components/ConsentScreen";
import { LoginScreen } from "./components/LoginScreen";
import { StatusIndicator } from "./components/StatusIndicator";
import { ConversationView } from "./components/ConversationView";
import { PortalGrid } from "./components/PortalGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { HelpPanel } from "./components/HelpPanel";
import { AutomationPanel, type AutomationStepView } from "./components/AutomationPanel";
import { VoiceOrb } from "./components/VoiceOrb";
import { BotMascot } from "./components/BotMascot";
import { MicButton } from "./components/MicButton";
import { Particles } from "./components/Particles";
import { useDictionary } from "./i18n";
import type { MicState } from "./state/store";

// Hard guard against continuous mode quietly becoming always-on listening:
// if the mic sits in a silence-resumed "listening" state this long with
// zero speech at all (never even arming the per-utterance silence timer),
// the whole session ends and the mic is released. See docs/ARCHITECTURE.md
// "Security / privacy" — this is the boundary that keeps this feature from
// being the always-on listening this project has deliberately avoided.
const SESSION_INACTIVITY_TIMEOUT_MS = 30_000;

export function App() {
  const t = useDictionary();
  const ORB_LABELS: Record<MicState, string> = t.orbLabels;
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [micPermissionWarning, setMicPermissionWarning] = useState(false);
  const [automationActive, setAutomationActive] = useState(false);
  const [automationGoal, setAutomationGoal] = useState("");
  const [automationSteps, setAutomationSteps] = useState<AutomationStepView[]>([]);

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
  const silenceDetector = useRef(new SilenceDetector());
  // Whether a session is currently in flight — guards the race where the
  // user (or a connection/error event) ends the session while a reply is
  // still being spoken, so that callback doesn't resume listening into a
  // session that's already been stopped. Not store state — read inside
  // async closures (the TTS-then callback below) the same way this file
  // always reads useAppStore.getState() directly instead of a destructured
  // value in a handler, to avoid stale-closure/re-render races.
  const sessionActive = useRef(false);
  const sessionInactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function armSessionInactivityTimer() {
    if (sessionInactivityTimer.current !== null) clearTimeout(sessionInactivityTimer.current);
    sessionInactivityTimer.current = setTimeout(endSession, SESSION_INACTIVITY_TIMEOUT_MS);
  }

  // Starts recording — used both for the initial hotkey press and to resume
  // listening after each reply, so a multi-step task never needs the hotkey
  // pressed again mid-task. Every session is continuous; there is no
  // single-shot mode.
  async function startListening() {
    setMicState("listening");
    window.jarvis.conversation.setActive(true);
    await micCapture.current.start(() => {
      setMicPermissionWarning(true);
      endSession();
    });

    if (!sessionActive.current) return; // permission was denied above

    const stream = micCapture.current.getStream();
    if (stream) {
      silenceDetector.current.start(stream, () => micCapture.current.stop());
    }
    armSessionInactivityTimer();
  }

  // The one way a session ever ends — same meaning everywhere it's called
  // (hotkey press mid-session, connection lost, a turn errored out, mic
  // permission denied): stop everything and go fully idle. No separate
  // "pause" vs "end" distinction. Safe to call even when nothing is
  // currently active — every sub-call here is already a no-op in that case
  // (MicCapture.stop() checks its own recorder state; SpeechSynthesis
  // cancel()/spd-say -C are no-ops with nothing playing).
  function endSession() {
    if (sessionInactivityTimer.current !== null) {
      clearTimeout(sessionInactivityTimer.current);
      sessionInactivityTimer.current = null;
    }
    sessionActive.current = false;
    silenceDetector.current.stop();
    micCapture.current.stop();
    ttsEngine.current.stop();
    setMicState("idle");
    window.jarvis.conversation.setActive(false);
  }

  // Single toggle used by BOTH the hotkey and the mic button, so there is one
  // source of truth for "are we currently recording" — reads the store directly
  // (not the destructured `micState` above) since this is called from an event
  // handler registered once on mount, where a closed-over value would go stale.
  function toggleMic() {
    // A computer-use task runs independently of mic state (it's driven by
    // spoken risk-confirmations between server-side steps, not by active
    // recording) — pressing the hotkey/mic button while one is running
    // always means "stop the automation," same "one control, one meaning"
    // precedent as endSession() below.
    if (automationActive) {
      window.jarvis.conversation.cancelAutomation();
      return;
    }

    const current = useAppStore.getState().micState;

    if (current === "idle") {
      sessionActive.current = true;
      startListening();
      return;
    }

    // Pressing at ANY point (listening/thinking/speaking) always means
    // "stop everything" — one control, one meaning.
    endSession();
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
          endSession();
        }
      }
    });

    window.jarvis.conversation.onTranscript((text) => {
      pushTurn({ role: "user", text });
      setMicState("thinking");
      // A real utterance made it all the way to a transcript — the
      // inactivity timer (armed in startListening for "nothing said at
      // all") is no longer the relevant risk for this listening period.
      // It gets re-armed on the next resumed startListening() call anyway.
      if (sessionInactivityTimer.current !== null) {
        clearTimeout(sessionInactivityTimer.current);
        sessionInactivityTimer.current = null;
      }
    });

    window.jarvis.conversation.onAssistantText((text) => {
      pushTurn({ role: "assistant", text });
      setMicState("speaking");
      ttsEngine.current.speak(text, useAppStore.getState().language).then(() => {
        // Guards the race where the user manually ended the session (or it
        // was ended by a connection/error event) while this reply was still
        // being spoken — without this check, this callback would resume
        // listening right after a session the user already stopped.
        if (sessionActive.current) {
          startListening();
          return;
        }
        setMicState("idle");
        window.jarvis.conversation.setActive(false);
      });
    });

    window.jarvis.conversation.onError((payload) => {
      setError(payload);
      endSession();
    });

    window.jarvis.conversation.onAutomationStart((payload) => {
      setAutomationActive(true);
      setAutomationGoal(payload.goal);
      setAutomationSteps([]);
    });
    window.jarvis.conversation.onAutomationStep((payload) => {
      setAutomationSteps((steps) => [...steps, { description: payload.message, risk: payload.action.risk, ok: payload.ok }]);
    });
    window.jarvis.conversation.onAutomationStop(() => {
      setAutomationActive(false);
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
          {micState !== "idle" && <p className="hint">{t.app.continuousSessionHint}</p>}
        </div>

        {turns.length === 0 ? <PortalGrid /> : <ConversationView turns={turns} />}

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
        {automationActive && (
          <AutomationPanel
            goal={automationGoal}
            steps={automationSteps}
            onStop={() => window.jarvis.conversation.cancelAutomation()}
          />
        )}
      </div>
    </>
  );
}
