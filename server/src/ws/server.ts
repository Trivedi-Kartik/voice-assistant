import type { Server as HttpServer } from "node:http";
import * as Sentry from "@sentry/node";
import { WebSocketServer, type WebSocket } from "ws";
import { consumeWsTicket } from "../auth/wsTicket.js";
import { db } from "../db.js";
import { Session } from "./session.js";
import type { ClientMessage } from "../protocol.js";

// One Session per authenticated connection. Identity is fixed at handshake time from
// the ticket — no message the client sends afterwards is ever trusted to carry a
// userId, which is what makes cross-user leakage structurally impossible rather than
// merely policy. See docs/ARCHITECTURE.md "Real-time session management".
export function attachWsServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req) => {
    // Real bug, confirmed live: this callback isn't awaited by the
    // EventEmitter, so a rejected promise anywhere in the connection-setup
    // path (e.g. a transient DB blip on the findUnique/update calls below)
    // was an unhandled rejection — which crashed the whole process, not just
    // this one connection. See index.ts for the same class of fix on the
    // HTTP side (asyncHandler) — here it's a plain try/catch since there's
    // no Express error middleware to forward to.
    handleConnection(ws, req).catch((err) => {
      console.error("[ws] connection setup failed", err);
      Sentry.captureException(err);
      ws.close(1011, "internal_error");
    });
  });

  async function handleConnection(ws: WebSocket, req: import("node:http").IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? "", "http://internal");
    const ticket = url.searchParams.get("ticket");

    if (!ticket) {
      ws.close(4401, "missing_ticket");
      return;
    }

    const identity = await consumeWsTicket(ticket);
    if (!identity) {
      ws.close(4401, "invalid_or_expired_ticket");
      return;
    }

    const device = await db.device.findUnique({
      where: { id: identity.deviceId },
      include: { user: { select: { language: true } } },
    });
    if (!device || device.revokedAt) {
      ws.close(4401, "device_revoked");
      return;
    }
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

    const capabilities = Array.isArray(device.capabilities) ? (device.capabilities as string[]) : [];
    const session = await Session.create(ws, identity.userId, identity.deviceId, capabilities, device.user.language);

    ws.send(JSON.stringify({ type: "auth_ok" }));

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // malformed frame — ignore rather than crash the connection
      }
      session.handleMessage(msg).catch((err) => console.error("[ws] message handling failed", err));
    });

    ws.on("close", () => session.handleDisconnect());
    ws.on("error", () => session.handleDisconnect());
  }
}
