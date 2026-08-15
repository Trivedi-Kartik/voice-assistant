import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserWindow, dialog } from "electron";
import type { ToolResult } from "./types.js";
import { addCustomApp } from "../customApps/customAppStore.js";

const execFileAsync = promisify(execFile);

// Standard "living-off-the-land" binaries real attacks abuse to get a shell,
// modify the registry, or download further payloads — these can never be
// added as a custom app, no exceptions. Defense in depth: the primary
// safety property is structural (both resolution paths below only ever
// produce something the user actually asked for by name among their own
// already-installed apps, or a file they physically browsed to and
// selected — never free text fed into a command).
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

interface StartApp {
  Name: string;
  AppID: string;
}

// Real bug, confirmed via live use: Microsoft Store/UWP apps live in a
// protected folder a file picker can't properly browse into or select from
// — trying to anyway silently picks the wrong thing (e.g. a Store shortcut
// instead of the real app). Get-StartApps is Windows' own list of every
// installed Start Menu entry — traditional AND Store apps alike — and its
// AppID is already the right launch target for either kind. Deliberately a
// FIXED, parameter-less PowerShell command: the user's spoken name is never
// interpolated into it. All name matching happens afterward, in plain JS
// string comparisons against the returned list — there's no path from
// spoken text into a shell command anywhere in this function.
async function listStartApps(): Promise<StartApp[]> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-StartApps | ConvertTo-Json -Compress",
  ]);
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function findBestMatch(apps: StartApp[], name: string): StartApp | undefined {
  const needle = name.toLowerCase().trim();
  const exact = apps.find((a) => a.Name.toLowerCase() === needle);
  if (exact) return exact;
  // Only auto-pick a substring match if it's unambiguous — an ambiguous
  // name (multiple partial matches) falls back to the file picker rather
  // than guessing which one the user meant.
  const partial = apps.filter((a) => a.Name.toLowerCase().includes(needle));
  return partial.length === 1 ? partial[0] : undefined;
}

async function pickExeFile(name: string): Promise<string | undefined> {
  const parent = BrowserWindow.getFocusedWindow();
  const options = {
    title: `Choose the program for "${name}"`,
    properties: ["openFile" as const],
    filters: [{ name: "Applications", extensions: ["exe"] }],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

export async function addCustomAppWin(name: string): Promise<ToolResult> {
  let openCommand: string;
  let processName: string | undefined;

  const match = await listStartApps()
    .then((apps) => findBestMatch(apps, name))
    .catch(() => undefined); // PowerShell unavailable/failed — fall back below rather than error out

  if (match) {
    const isStoreApp = match.AppID.includes("!"); // UWP AppIDs are "<PackageFamilyName>!<AppId>"
    openCommand = isStoreApp ? `shell:AppsFolder\\${match.AppID}` : match.AppID;
    processName = isStoreApp ? undefined : path.basename(match.AppID);
  } else {
    const picked = await pickExeFile(name);
    if (!picked) {
      return { ok: false, message: `No app was selected — "${name}" wasn't added.` };
    }
    openCommand = picked;
    processName = path.basename(picked);
  }

  if (processName && DENYLIST.has(processName.toLowerCase())) {
    return { ok: false, message: `"${processName}" can't be added — that's a system program, not a regular app.` };
  }

  addCustomApp(name, openCommand, processName);
  return {
    ok: true,
    message: processName
      ? `Added ${name} — you can now say "open ${name}" or "close ${name}".`
      : `Added ${name} — you can now say "open ${name}". It's a Microsoft Store app, so it can't be closed this way.`,
  };
}
