import Store from "electron-store";

export interface CustomApp {
  name: string; // lowercase, trimmed — matches appRegistry.ts's key convention
  exePath: string;
  processName: string;
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
export function addCustomApp(name: string, exePath: string, processName: string): CustomApp {
  const app: CustomApp = { name: name.toLowerCase().trim(), exePath, processName };
  store.set("apps", [...all().filter((a) => a.name !== app.name), app]);
  return app;
}

export function removeCustomApp(name: string): void {
  const key = name.toLowerCase().trim();
  store.set("apps", all().filter((a) => a.name !== key));
}
