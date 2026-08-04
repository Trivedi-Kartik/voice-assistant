// v1 implements HotkeyTriggerSource only. Wake-word (Porcupine, v2 roadmap item)
// becomes a second implementation of this exact interface — the renderer, WS
// protocol, and tool execution never need to change to support it. See
// docs/ARCHITECTURE.md and agent/src/main/wakeword/wakeWordTriggerSource.ts.
export interface TriggerSource {
  start(onActivate: () => void, onDeactivate: () => void): void;
  stop(): void;
}
