import Store from "electron-store";
import { randomUUID } from "node:crypto";

export interface PersistedReminder {
  id: string;
  text: string;
  fireAt: number; // epoch ms
  firedAt?: number; // epoch ms — undefined means still pending
}

// Client-local only — see docs/ARCHITECTURE.md "set_reminder" for why: no
// server changes, no cross-device sync, lost if the app is fully quit before
// fireAt. Same storage pattern as consent.ts/deviceId.ts (one Store per
// concern).
const store = new Store<{ reminders: PersistedReminder[] }>({ name: "reminders" });

function all(): PersistedReminder[] {
  return store.get("reminders") ?? [];
}

export function addReminder(text: string, fireAt: number): PersistedReminder {
  const reminder: PersistedReminder = { id: randomUUID(), text, fireAt };
  store.set("reminders", [...all(), reminder]);
  return reminder;
}

// Pending = not yet fired, regardless of whether fireAt is in the past
// (overdue ones are exactly what the startup catch-up check looks for).
export function listPending(): PersistedReminder[] {
  return all().filter((r) => r.firedAt === undefined);
}

export function markFired(id: string): void {
  store.set(
    "reminders",
    all().map((r) => (r.id === id ? { ...r, firedAt: Date.now() } : r))
  );
}
