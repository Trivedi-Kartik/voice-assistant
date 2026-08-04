import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AccessTokenPayload {
  userId: string;
  deviceId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessTtlSeconds });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload & jwt.JwtPayload;
}
