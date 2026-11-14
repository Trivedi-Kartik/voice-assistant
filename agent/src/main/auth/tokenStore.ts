import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

// Refresh token is the only long-lived secret persisted to disk, encrypted via
// Electron's safeStorage (OS-level DPAPI on Windows) — scoped to the current
// Windows user account. The access token never touches disk (main-process
// memory only, see authManager.ts).
function tokenFilePath(): string {
  return path.join(app.getPath("userData"), "auth.enc");
}

export function saveRefreshToken(token: string): void {
  // Never throw out of here: this runs inside login, after the server already issued tokens. A
  // throw made login look failed (and skipped scheduling the refresh timer) on machines with no
  // OS keyring. Without encryption we simply don't persist — the user re-enters their password
  // next launch, which beats writing a long-lived credential to disk in plaintext.
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[auth] OS encryption unavailable — refresh token not persisted (re-login next launch)");
      return;
    }
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
      // Electron's fallback uses a hardcoded key: effectively plaintext. Persist anyway (owner-only
      // file below) but make it visible — install gnome-keyring/kwallet for real protection.
      console.warn("[auth] no OS keyring found (Linux basic_text backend) — token file is only obfuscated");
    }
    fs.writeFileSync(tokenFilePath(), safeStorage.encryptString(token), { mode: 0o600 });
  } catch (err) {
    console.error("[auth] couldn't persist refresh token", err);
  }
}

export function loadRefreshToken(): string | null {
  try {
    const encrypted = fs.readFileSync(tokenFilePath());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function clearRefreshToken(): void {
  try {
    fs.unlinkSync(tokenFilePath());
  } catch {
    // nothing to clear
  }
}
