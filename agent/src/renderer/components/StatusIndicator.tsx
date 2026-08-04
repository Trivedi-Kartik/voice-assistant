import type { UiStatus } from "../state/store";

const CONNECTION_LABEL: Record<UiStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  error: "Connection lost",
};

// Connection state only — mic state is now shown by the VoiceOrb, which is the
// actual focal point of the screen. One small, finite set of states —
// deliberately not scattered ad hoc console logging, since a real product needs
// the user to always understand why nothing is happening. See
// docs/ARCHITECTURE.md "Failure modes".
export function StatusIndicator({
  connectionStatus,
  onRetry,
}: {
  connectionStatus: UiStatus;
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
    </div>
  );
}
