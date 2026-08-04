import { db } from "./db.js";
import { env } from "./env.js";
import { decryptApiKey } from "./crypto.js";

export interface ResolvedGroqKey {
  apiKey: string;
  isByok: boolean;
}

// Resolves which Groq key a given user's calls should use: their own (BYOK, no
// daily cap) if they've set one, otherwise the shared free-tier key (capped).
export async function resolveGroqKey(userId: string): Promise<ResolvedGroqKey> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { groqApiKeyEnc: true } });
  if (user.groqApiKeyEnc) {
    return { apiKey: decryptApiKey(Buffer.from(user.groqApiKeyEnc)), isByok: true };
  }
  return { apiKey: env.groqApiKey, isByok: false };
}
