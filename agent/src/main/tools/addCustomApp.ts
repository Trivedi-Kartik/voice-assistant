import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { addCustomApp } from "../customApps/customAppStore.js";

// Standard "living-off-the-land" binaries real attacks abuse to get a shell,
// modify the registry, or download further payloads — these can never be
// added as a custom app, no exceptions. This is defense in depth: the
// primary safety property is structural (the file picker below only ever
// returns a real, existing file the user actually browsed to and selected —
// there is no text field to type a command into), not this list alone.
const DENYLIST = new Set([
  "cmd.exe",
  "powershell.exe",
  "powershell_ise.exe",
  "pwsh.exe",
  "regedit.exe",
  "reg.exe",
  "taskkill.exe",
  "control.exe",
  "mmc.exe",
  "wscript.exe",
  "cscript.exe",
  "wmic.exe",
  "bcdedit.exe",
  "diskpart.exe",
  "net.exe",
  "net1.exe",
  "netsh.exe",
  "cipher.exe",
  "takeown.exe",
  "icacls.exe",
  "schtasks.exe",
  "sc.exe",
  "msiexec.exe",
  "rundll32.exe",
  "regsvr32.exe",
  "mshta.exe",
  "certutil.exe",
]);

const argsSchema = z.object({ name: z.string().min(1).max(50) });

export const addCustomAppTool: ToolDefinition<{ name: string }> = {
  name: "add_custom_app",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ name }) {
    const parent = BrowserWindow.getFocusedWindow();
    const options = {
      title: `Choose the program for "${name}"`,
      properties: ["openFile" as const],
      filters: [{ name: "Applications", extensions: ["exe"] }],
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: `No app was selected — "${name}" wasn't added.` };
    }

    const exePath = result.filePaths[0];
    const processName = path.basename(exePath);
    if (DENYLIST.has(processName.toLowerCase())) {
      return { ok: false, message: `"${processName}" can't be added — that's a system program, not a regular app.` };
    }

    addCustomApp(name, exePath, processName);
    return { ok: true, message: `Added ${name} — you can now say "open ${name}" or "close ${name}".` };
  },
};
