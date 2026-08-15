import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { addCustomAppWin } from "./addCustomApp.win.js";
import { addCustomAppLinux } from "./addCustomApp.linux.js";

const argsSchema = z.object({ name: z.string().min(1).max(50) });

// Platform dispatch — same shape as appRegistry.ts/appExec.ts. Windows
// resolves via Get-StartApps/Microsoft Store AppIDs; Linux resolves via
// .desktop files (the freedesktop.org app registry every apt/snap/flatpak
// install registers into) — see addCustomApp.linux.ts for why that's the
// right equivalent rather than a raw file picker.
export const addCustomAppTool: ToolDefinition<{ name: string }> = {
  name: "add_custom_app",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ name }) {
    return process.platform === "win32" ? addCustomAppWin(name) : addCustomAppLinux(name);
  },
};
