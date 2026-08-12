import Store from "electron-store";

export interface CustomApp {
  name: string; // lowercase, trimmed — matches appRegistry.ts's key convention
  // A real exe path for traditional apps, or a "shell:AppsFolder\<AppID>"
  // string for Microsoft Store/UWP apps — both are valid targets for the
  // exact same `cmd.exe /c start "" <openCommand>` mechanism openApp.ts
  // already uses, so no execution-side branching was needed for this.
  openCommand: string;
  // Omitted for Store/UWP apps — same "open-only" convention as
  // appRegistry.ts's built-in entries (e.g. File Explorer): a UWP AppID
  // isn't a real process name, so there's no reliable processName to give
  // taskkill.
  processName?: string;
}

// Client-local only, per device — a user's own app, added by them, never
// synced or visible to anyone else. Same storage pattern as
// reminders/reminderStore.ts and consent.ts (one Store per concern).
const store = new Store<{ apps: CustomApp[] }>({ name: "custom-apps" });

function all(): CustomApp[] {
  return store.get("apps") ?? [];
}

export function listCustomApps(): CustomApp[] {
  return all();
}

export function findCustomApp(name: string): CustomApp | undefined {
  const key = name.toLowerCase().trim();
  return all().find((a) => a.name === key);
}

// A later add with the same name replaces the earlier one — re-adding
// "photoshop" pointed at a different install is a correction, not a
// duplicate entry.
export function addCustomApp(name: string, openCommand: string, processName?: string): CustomApp {
  const app: CustomApp = { name: name.toLowerCase().trim(), openCommand, processName };
  store.set("apps", [...all().filter((a) => a.name !== app.name), app]);
  return app;
}

export function removeCustomApp(name: string): void {
  const key = name.toLowerCase().trim();
  store.set("apps", all().filter((a) => a.name !== key));
}
