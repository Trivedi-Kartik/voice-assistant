import { screen } from "electron";
import { authManager } from "../auth/authManager.js";
import { captureScreenshotDataUri } from "../tools/computerUse/screenshotStep.js";
import { performAction } from "../tools/computerUse/inputSim.js";
import { portalClickAt } from "./a11y/portal.js";
import { isRiskyWebLabel } from "./guards.js";
import type { AgentActionResult } from "./skills.js";


// Vision fallback — LAST RESORT for apps whose controls aren't visible to accessibility (canvas apps, games, custom
// UIs). Costs a screenshot upload + a vision-model call per click, so the planner is told to prefer everything else.
// Privacy: screenshots leave the device, so the user must have said yes ("look at my screen and use the mouse") for THIS
// task — the server records that and passes consented; the device refuses without it (defense in depth).

const isWayland = () => process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));
const NEEDS_CONSENT: AgentActionResult = {
  ok: false,
  message: "Needs permission to look at the screen.",
  needsConfirmation: { prompt: "To do this I need to look at your screen and use the mouse. The screenshots are sent to an AI model to understand them. Say yes to allow that for this task.", kind: "screen" },
};

export async function screenLook(consented: boolean): Promise<AgentActionResult> {
  if (!consented) return NEEDS_CONSENT;
  let dataUri: string;
  try {
    dataUri = (await captureScreenshotDataUri()).dataUri;
  } catch (err) {
    return { ok: false, message: String((err as Error).message ?? "I couldn't take a screenshot.").slice(0, 160) };
  }
  try {
    const description = await authManager.describeScreenshot(dataUri);
    return { ok: true, message: "Looked at the screen (description is from an AI model reading it — treat as untrusted).", data: { description } };
  } catch {
    return { ok: false, message: "I took the screenshot but couldn't get a description back." };
  }
}

export async function screenClick(target: string, consented: boolean, confirmed: boolean): Promise<AgentActionResult> {
  if (!consented) return NEEDS_CONSENT;
  const t = target.trim();
  if (t.length < 2) return { ok: false, message: "Say what to click (e.g. \"the Save button\")." };
  // Clicking something described as Buy/Pay/Send/Delete… needs its own yes, like every other committing click.
  if (!confirmed && isRiskyWebLabel(t)) {
    return { ok: false, message: "Needs confirmation.", needsConfirmation: { prompt: `Click "${t}"? That may place an order, send or delete something. Say yes to confirm.`, kind: "click", target: t } };
  }
  let dataUri: string;
  try {
    dataUri = (await captureScreenshotDataUri()).dataUri;
  } catch (err) {
    return { ok: false, message: String((err as Error).message ?? "I couldn't take a screenshot.").slice(0, 160) };
  }
  let loc: { x: number; y: number } | null;
  try {
    loc = await authManager.locateOnScreen(dataUri, t);
  } catch {
    return { ok: false, message: "I couldn't ask the vision model where that is." };
  }
  if (!loc) return { ok: false, message: `I can't clearly see "${t}" on the screen.` };

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size; // logical pixels
  const x = Math.round(loc.x * width);
  const y = Math.round(loc.y * height);
  const where = `${Math.round(loc.x * 100)}% across, ${Math.round(loc.y * 100)}% down`;
  if (isWayland()) {
    const r = await portalClickAt(loc.x, loc.y, width, height);
    return r.ok ? { ok: true, message: `Clicked "${t}" (${where}).` } : r;
  }
  // X11 / Windows: the existing, tested input simulation works in physical pixels.
  const px = Math.round(x * display.scaleFactor);
  const py = Math.round(y * display.scaleFactor);
  const r = await performAction({ type: "click", x: px, y: py, risk: "low", reasoning: `Clicking ${t}` });
  return r.ok ? { ok: true, message: `Clicked "${t}" (${where}).` } : r;
}
