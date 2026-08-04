import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { addReminder } from "../reminders/reminderStore.js";

// Relative delay only, not an absolute time-of-day ("at 6pm") — nothing in
// this codebase tells the model the user's timezone, so absolute times risk
// firing at the wrong local hour. See docs/ARCHITECTURE.md "set_reminder".
const argsSchema = z.object({
  text: z.string().min(1),
  delayMinutes: z.number().int().min(1).max(10_080), // cap: 7 days out
});

export const setReminderTool: ToolDefinition<{ text: string; delayMinutes: number }> = {
  name: "set_reminder",
  sensitivity: "low",
  parseArgs: (raw) => argsSchema.parse(raw),
  async execute({ text, delayMinutes }) {
    addReminder(text, Date.now() + delayMinutes * 60_000);
    return { ok: true, message: `I'll remind you to ${text} in ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"}.` };
  },
};
