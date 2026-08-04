import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt.js";

export interface AuthedRequest extends Request {
  auth?: { userId: string; deviceId: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.userId, deviceId: payload.deviceId };
    next();
  } catch {
    res.status(401).json({ error: "auth_expired" });
  }
}
