import type { MicState, UiStatus } from "../state/store";

const CONNECTION_LABEL: Record<UiStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  error: "Connection lost",
};

const MIC_LABEL: Record<MicState, string> = {
  idle: "Press Ctrl+Shift+Space to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// One small, finite set of states — deliberately not scattered ad hoc console
// logging, since a real product needs the user to always understand why nothing
// is happening. See docs/ARCHITECTURE.md "Failure modes".
export function StatusIndicator({
  connectionStatus,
  micState,
  onRetry,
}: {
  connectionStatus: UiStatus;
  micState: MicState;
  onRetry: () => void;
}) {
  return (
    <div className={`status-indicator status-${connectionStatus}`}>
      <span className="connection-dot" />
      <span>{CONNECTION_LABEL[connectionStatus]}</span>
      {connectionStatus === "error" && (
        <button onClick={onRetry} className="retry-button">
          Retry connection
        </button>
      )}
      {connectionStatus === "connected" && <span className="mic-state"> · {MIC_LABEL[micState]}</span>}
    </div>
  );
}
