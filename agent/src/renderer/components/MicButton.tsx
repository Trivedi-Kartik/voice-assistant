import type { MicState } from "../state/store";
import { useDictionary } from "../i18n";

// Visual start/stop affordance alongside the hotkey (Ctrl+Shift+Space) — same
// toggleMic() call either way, see App.tsx, so the two controls can never disagree
// about whether the app is currently recording.
export function MicButton({ micState, onClick }: { micState: MicState; onClick: () => void }) {
  const t = useDictionary();
  const listening = micState === "listening";
  const busy = micState === "thinking" || micState === "speaking";
  const label = listening ? t.micButton.stopTalking : t.micButton.startTalking;

  return (
    <button
      type="button"
      className={`mic-button${listening ? " mic-button-listening" : ""}`}
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={`${label} (Ctrl+Shift+Space)`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15z" />
        <path d="M19 11.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7.01 7.01 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.57a7.01 7.01 0 0 0 6-6.93z" />
      </svg>
    </button>
  );
}
