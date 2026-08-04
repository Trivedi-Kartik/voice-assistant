import { autoUpdater } from "electron-updater";

// Checks GitHub Releases (see electron-builder.yml `publish` config) — free,
// consistent with the project's "free-tier everything" pattern. Never force-quits
// mid-conversation: the caller decides when it's safe to actually restart.
export function initAutoUpdater(isConversationActive: () => boolean, onUpdateReady: () => void): void {
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-downloaded", () => {
    if (!isConversationActive()) {
      onUpdateReady();
    } else {
      const check = setInterval(() => {
        if (!isConversationActive()) {
          clearInterval(check);
          onUpdateReady();
        }
      }, 30_000);
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("[updater] check failed", err));
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }, 1000 * 60 * 60 * 4); // every 4 hours
}
