import type { TriggerSource } from "../hotkey/triggerSource.js";

// NOT wired in v1 (see docs/ROADMAP.md Phase 3 — wake-word comes after wider
// automation trust/retention is established, since always-listening is a bigger
// consent surface on a hosted multi-tenant product than on-demand hotkey capture).
//
// When implemented, this needs its OWN always-on, fully-local mic tap read
// directly in main (Porcupine's Node mic utility) — a separate audio path from the
// renderer's on-demand MediaRecorder stream that never leaves the machine, since
// always-listening has a materially different privacy posture than push-to-talk.
export class WakeWordTriggerSource implements TriggerSource {
  start(): void {
    throw new Error("WakeWordTriggerSource is not implemented yet — v2 roadmap item.");
  }

  stop(): void {
    // no-op until implemented
  }
}
