import type { UiStatus } from "../state/store";
import { useDictionary } from "../i18n";

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
  const t = useDictionary();
  const connectionLabel: Record<UiStatus, string> = t.statusIndicator;

  return (
    <div className={`status-indicator status-${connectionStatus}`}>
      <span className="connection-dot" />
      <span>{connectionLabel[connectionStatus]}</span>
      {connectionStatus === "error" && (
        <button onClick={onRetry} className="retry-button">
          {t.statusIndicator.retryConnection}
        </button>
      )}
    </div>
  );
}
