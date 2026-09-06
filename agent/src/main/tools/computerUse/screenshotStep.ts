import { desktopCapturer, screen } from "electron";

// Factored out of takeScreenshot.ts (same capture settings) — the automation
// loop needs a fresh screenshot after every action, not just once. Primary
// display only, same reasoning as takeScreenshot.ts: capturing every monitor
// multiplies cost, and there's no reliable way to know which monitor an
// on-screen goal refers to anyway.
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 70;

export interface ScreenshotCapture {
  dataUri: string;
  // originalWidth / resizedWidth — e.g. 1.5 on a 1920px-wide screen resized to
  // 1280. The vision model only ever sees the RESIZED image, so its decided
  // click/scroll coordinates are in that smaller space; the automation runner
  // must multiply by this before executing on the real screen, or every click
  // lands in the wrong place (shifted toward the top-left the wider the real
  // screen is than MAX_WIDTH) — a real bug found via live testing: clicks were
  // landing on desktop/taskbar icons instead of inside the target window.
  scale: number;
}

export async function captureScreenshotDataUri(): Promise<ScreenshotCapture> {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: display.size,
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("no_screen_source");

  const { width } = source.thumbnail.getSize();
  const shouldResize = width > MAX_WIDTH;
  const resized = shouldResize ? source.thumbnail.resize({ width: MAX_WIDTH }) : source.thumbnail;
  const dataUri = `data:image/jpeg;base64,${resized.toJPEG(JPEG_QUALITY).toString("base64")}`;
  return { dataUri, scale: shouldResize ? width / MAX_WIDTH : 1 };
}
