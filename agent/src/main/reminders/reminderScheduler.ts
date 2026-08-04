import { Notification } from "electron";
import { listPending, markFired } from "./reminderStore.js";

const CHECK_INTERVAL_MS = 20_000;

function fireDue(): void {
  const now = Date.now();
  for (const reminder of listPending()) {
    if (reminder.fireAt > now) continue;
    if (Notification.isSupported()) {
      new Notification({ title: "Reminder", body: reminder.text }).show();
    }
    markFired(reminder.id);
  }
}

// Called once from main/index.ts on app.whenReady(). The immediate call
// covers "catch-up on launch" — a reminder that was due while the app was
// fully quit fires right away instead of being silently lost — then the
// interval covers reminders that come due while the app keeps running.
export function startReminderScheduler(): void {
  fireDue();
  setInterval(fireDue, CHECK_INTERVAL_MS);
}
