import type { MicState } from "../state/store";

const LABELS: Record<MicState, string> = {
  idle: "Press Ctrl+Shift+Space to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// Central animated indicator — the actual "talking to a bot" focal point, so mic
// state is felt at a glance instead of read as a line of text. Pure CSS
// (keyframe/transform based, see styles.css) — no animation library dependency.
export function VoiceOrb({ state }: { state: MicState }) {
  return (
    <div className={`voice-orb voice-orb-${state}`}>
      <div className="voice-orb-ring voice-orb-ring-1" />
      <div className="voice-orb-ring voice-orb-ring-2" />
      <div className="voice-orb-core" />
      <div className="voice-orb-label">{LABELS[state]}</div>
    </div>
  );
}
