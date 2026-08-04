import { globalShortcut } from "electron";
import type { TriggerSource } from "./triggerSource.js";

const ACCELERATOR = "CommandOrControl+Shift+Space";

export class HotkeyTriggerSource implements TriggerSource {
  start(onPress: () => void): void {
    globalShortcut.register(ACCELERATOR, onPress);
  }

  stop(): void {
    globalShortcut.unregister(ACCELERATOR);
  }
}
