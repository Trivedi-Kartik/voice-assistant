import { globalShortcut } from "electron";
import type { TriggerSource } from "./triggerSource.js";

const ACCELERATOR = "CommandOrControl+Shift+Space";

export class HotkeyTriggerSource implements TriggerSource {
  private active = false;

  start(onActivate: () => void, onDeactivate: () => void): void {
    globalShortcut.register(ACCELERATOR, () => {
      this.active = !this.active;
      if (this.active) onActivate();
      else onDeactivate();
    });
  }

  stop(): void {
    globalShortcut.unregister(ACCELERATOR);
  }
}
