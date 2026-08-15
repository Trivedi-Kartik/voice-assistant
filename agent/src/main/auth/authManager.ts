import { getDeviceId, getDeviceName } from "./deviceId.js";
import { loadRefreshToken, saveRefreshToken, clearRefreshToken } from "./tokenStore.js";
import { DEVICE_CAPABILITIES } from "../deviceCapabilities.js";

export const SERVER_HTTP_URL = process.env.SERVER_HTTP_URL ?? "http://localhost:8080";

// Was hardcoded to "windows" regardless of the actual OS — harmless while
// the client only ran on Windows, but wrong once Linux support landed.
// Matches server/src/auth/routes.ts's credentialsSchema platform enum,
// which has always accepted "linux".
function currentPlatform(): "windows" | "mac" | "linux" {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  return "windows";
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  language: string;
}

interface Session {
  accessToken: string;
  language: string;
}

// Holds the access token in main-process memory ONLY — it never crosses into the
// renderer, which is the process most likely to ever load anything web-ish later
// (e.g. an OAuth webview). See docs/ARCHITECTURE.md "Auth on the client".
class AuthManager {
  private session: Session | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  async signup(email: string, password: string): Promise<void> {
    this.applyTokens(await this.postCredentials("/auth/signup", email, password));
  }

  async login(email: string, password: string): Promise<void> {
    this.applyTokens(await this.postCredentials("/auth/login", email, password));
  }

  // Called at app startup to silently resume a session from the persisted
  // refresh token, so re-launching the app doesn't force a re-login.
  async tryRestoreSession(): Promise<boolean> {
    const refreshToken = loadRefreshToken();
    if (!refreshToken) return false;
    try {
      await this.refresh(refreshToken);
      return true;
    } catch {
      clearRefreshToken();
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.session) {
      await fetch(`${SERVER_HTTP_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.session.accessToken}` },
      }).catch(() => undefined);
    }
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.session = null;
    clearRefreshToken();
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  // Defaults to "en" when logged out — matches the server's own User.language
  // default (server/prisma/schema.prisma), so callers never see undefined.
  getLanguage(): string {
    return this.session?.language ?? "en";
  }

  async setLanguage(language: string): Promise<void> {
    if (!this.session) throw new Error("not_logged_in");
    const res = await fetch(`${SERVER_HTTP_URL}/auth/me/language`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.session.accessToken}` },
      body: JSON.stringify({ language }),
    });
    if (!res.ok) throw new Error("set_language_failed");
    this.session.language = language;
  }

  async getWsTicket(): Promise<string> {
    if (!this.session) throw new Error("not_logged_in");
    const res = await fetch(`${SERVER_HTTP_URL}/auth/ws-ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.session.accessToken}` },
    });
    if (!res.ok) throw new Error("ws_ticket_failed");
    const data = (await res.json()) as { ticket: string };
    return data.ticket;
  }

  async setGroqKey(apiKey: string): Promise<void> {
    if (!this.session) throw new Error("not_logged_in");
    const res = await fetch(`${SERVER_HTTP_URL}/auth/me/groq-key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.session.accessToken}` },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) throw new Error("set_groq_key_failed");
  }

  // Used by the take_screenshot_and_describe tool (tools/takeScreenshot.ts) —
  // deliberately not exposed as a generic authenticated-fetch helper, so the
  // access token stays encapsulated in here per this class's own invariant.
  async describeScreenshot(imageDataUri: string): Promise<string> {
    if (!this.session) throw new Error("not_logged_in");
    const res = await fetch(`${SERVER_HTTP_URL}/vision/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.session.accessToken}` },
      body: JSON.stringify({ imageDataUri }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`describe_failed_${res.status}_${body.error ?? "unknown"}`);
    }
    const data = (await res.json()) as { description: string };
    return data.description;
  }

  private async postCredentials(path: string, email: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${SERVER_HTTP_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        platform: currentPlatform(),
        capabilities: DEVICE_CAPABILITIES,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `request_failed_${res.status}`);
    }
    return res.json() as Promise<TokenResponse>;
  }

  private async refresh(refreshToken: string): Promise<void> {
    const res = await fetch(`${SERVER_HTTP_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error("refresh_failed");
    this.applyTokens((await res.json()) as TokenResponse);
  }

  private applyTokens(data: TokenResponse): void {
    this.session = { accessToken: data.accessToken, language: data.language };
    saveRefreshToken(data.refreshToken);
    this.scheduleProactiveRefresh(data.refreshToken, data.expiresIn);
  }

  // Refresh at ~80% of TTL so refresh is the common path, not just a 401-triggered
  // fallback — the user should almost never see an auth-expired hiccup mid-use.
  private scheduleProactiveRefresh(refreshToken: string, expiresInSeconds: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delayMs = expiresInSeconds * 0.8 * 1000;
    this.refreshTimer = setTimeout(() => {
      this.refresh(refreshToken).catch((err) => console.error("[auth] proactive refresh failed", err));
    }, delayMs);
  }
}

export const authManager = new AuthManager();
