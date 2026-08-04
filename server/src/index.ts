import http from "node:http";
import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./auth/routes.js";
import { attachWsServer } from "./ws/server.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);

const httpServer = http.createServer(app);
attachWsServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`[server] listening on :${env.port} (HTTP + WS on /ws)`);
});
