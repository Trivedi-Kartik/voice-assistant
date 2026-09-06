import { desktopCapturer, screen } from "electron";

// Factored out of takeScreenshot.ts (same capture settings) — the automation
// loop needs a fresh screenshot after every action, not just once. Primary
// display only, same reasoning as takeScreenshot.ts: capturing every monitor
// multiplies cost, and there's no reliable way to know which monitor an
// on-screen goal refers to anyway.
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 70;

export async function captureScreenshotDataUri(): Promise<string> {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: display.size,
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("no_screen_source");

  const { width } = source.thumbnail.getSize();
  const resized = width > MAX_WIDTH ? source.thumbnail.resize({ width: MAX_WIDTH }) : source.thumbnail;
  return `data:image/jpeg;base64,${resized.toJPEG(JPEG_QUALITY).toString("base64")}`;
}
