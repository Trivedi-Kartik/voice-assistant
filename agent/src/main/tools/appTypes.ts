// Shared by every platform's app registry (appRegistry.win.ts,
// appRegistry.linux.ts) so there's one definition, not one per platform.
export interface AppEntry {
  // Windows: passed to `cmd.exe /c start ""`. Linux: the binary name/path
  // passed to spawn(). See appExec.win.ts / appExec.linux.ts.
  openCommand: string;
  // Linux only — spawn() needs the command and its arguments as separate
  // array elements, unlike Windows' single openCommand string (`start`
  // takes one target). Ignored on Windows.
  args?: string[];
  // Windows: passed to `taskkill /IM <processName> /F`. Linux: passed to
  // `pkill -x <processName>`. Omit for apps that are unsafe or unreliable
  // to force-close generically (see each platform registry for specifics).
  processName?: string;
}
