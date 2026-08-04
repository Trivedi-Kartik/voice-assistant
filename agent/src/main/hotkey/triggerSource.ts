// v1 implements HotkeyTriggerSource only. Wake-word (Porcupine, v2 roadmap item)
// becomes a second implementation of this exact interface — the renderer, WS
// protocol, and tool execution never need to change to support it. See
// docs/ARCHITECTURE.md and agent/src/main/wakeword/wakeWordTriggerSource.ts.
//
// Deliberately a single onPress signal, not onActivate/onDeactivate: the renderer
// (which also now has a clickable mic button, see components/MicButton.tsx) is the
// single source of truth for whether it's currently recording. If main tracked its
// own active/inactive state independently, a button click and a hotkey press could
// disagree about the current state and desync (e.g. two MediaRecorders started).
export interface TriggerSource {
  start(onPress: () => void): void;
  stop(): void;
}
