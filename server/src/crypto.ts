import crypto from "node:crypto";
import { env } from "./env.js";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const key = Buffer.from(env.byokEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("BYOK_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return key;
}

// Encrypts a user-supplied Groq API key (BYOK) for storage in users.groq_api_key_enc.
// Format: iv (12 bytes) || authTag (16 bytes) || ciphertext, all concatenated.
export function encryptApiKey(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptApiKey(blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
