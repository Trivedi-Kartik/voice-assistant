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
  fs.writeFileSync(tokenFilePath(), safeStorage.encryptString(token));
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
