import { WebSocket } from "ws";
import { authManager } from "../auth/authManager.js";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";

const SERVER_WS_URL = process.env.SERVER_WS_URL ?? "ws://localhost:8080";

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

  constructor(private readonly callbacks: ConnectionCallbacks) {}

  async connect(): Promise<void> {
    this.manualStop = false;
    this.retryCount = 0;
    await this.open();
  }

  disconnect(): void {
    this.manualStop = true;
    this.ws?.close();
  }

  // Manual "Retry connection" action after MAX_RETRIES_BEFORE_MANUAL silent attempts.
  retryNow(): void {
    this.retryCount = 0;
    this.manualStop = false;
    this.open();
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
    this.setStatus(this.retryCount > 0 ? "reconnecting" : "connecting");

    let ticket: string;
    try {
      ticket = await authManager.getWsTicket();
    } catch {
      this.setStatus("error");
      return;
    }

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
    setTimeout(() => {
      if (!this.manualStop) void this.open();
    }, delay);
  }
}
