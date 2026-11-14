import { WebSocket } from "ws";
import { authManager } from "../auth/authManager.js";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";

// See authManager.ts's SERVER_HTTP_URL for why this fallback (not .env) is
// what actually reaches a packaged build.
const SERVER_WS_URL = process.env.SERVER_WS_URL ?? "wss://karvix-server.onrender.com";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface ConnectionCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onServerMessage: (msg: ServerMessage) => void;
}

const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES_BEFORE_MANUAL = 5;

// Reconnect/backoff lives here so every other module just calls connect()/send()
// and reacts to status changes — the retry policy is centralized in one place.
// See docs/ARCHITECTURE.md "Failure modes".
export class Connection {
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private manualStop = true;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly callbacks: ConnectionCallbacks) {}

  async connect(): Promise<void> {
    this.manualStop = false;
    this.retryCount = 0;
    await this.open();
  }

  disconnect(): void {
    this.manualStop = true;
    this.clearReconnectTimer();
    this.detachSocket();
    this.setStatus("idle"); // the detached socket's own "close" handler (which used to emit this) is gone
  }

  // Manual "Retry connection" action after MAX_RETRIES_BEFORE_MANUAL silent attempts.
  retryNow(): void {
    this.retryCount = 0;
    this.manualStop = false;
    void this.open();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // Closes the current socket and stops listening to it. close() is asynchronous, so without
  // detaching, the old socket's late "close" event would (after a quick logout/login or a retry)
  // schedule a reconnect and open a SECOND live socket whose messages still reach the app.
  private detachSocket(): void {
    const old = this.ws;
    this.ws = null;
    if (!old) return;
    old.removeAllListeners();
    old.on("error", () => undefined); // a detached socket erroring must not become an unhandled 'error'
    old.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.callbacks.onStatus(status);
  }

  private async open(): Promise<void> {
    this.clearReconnectTimer();
    this.detachSocket();
    this.setStatus(this.retryCount > 0 ? "reconnecting" : "connecting");

    let ticket: string;
    try {
      ticket = await authManager.getWsTicket();
    } catch {
      // A brief network blip here used to end the backoff chain after one attempt (the user had to
      // click Retry). Route it through the same retry policy as a dropped socket.
      if (this.manualStop) return;
      this.scheduleReconnect();
      return;
    }
    if (this.manualStop) return; // disconnect() was called while the ticket was being fetched

    const ws = new WebSocket(`${SERVER_WS_URL}/ws?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;

    ws.on("message", (raw) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // malformed frame — ignore rather than crash the connection
      }
      if (msg.type === "auth_ok") {
        this.retryCount = 0;
        this.setStatus("connected");
      }
      this.callbacks.onServerMessage(msg);
    });

    ws.on("close", () => {
      if (ws !== this.ws) return; // superseded by a newer socket
      if (this.manualStop) {
        this.setStatus("idle");
        return;
      }
      this.scheduleReconnect();
    });

    ws.on("error", () => {
      // "close" always follows "error" for ws — reconnect scheduling happens there.
    });
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES_BEFORE_MANUAL) {
      this.setStatus("error");
      return;
    }
    this.retryCount += 1;
    const delay = Math.min(1000 * 2 ** (this.retryCount - 1), MAX_BACKOFF_MS);
    this.setStatus("reconnecting");
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualStop) void this.open();
    }, delay);
  }
}
