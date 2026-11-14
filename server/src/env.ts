import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Number(undefined-or-garbage) is NaN, and `count > NaN` is always false — a bad DAILY_TURN_CAP
// would silently disable the cap. Fail fast at boot instead.
function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid env var ${name}: expected a positive number, got "${raw}"`);
  return n;
}

export const env = {
  port: numberEnv("PORT", 8080),
  groqApiKey: required("GROQ_API_KEY"),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtAccessTtlSeconds: numberEnv("JWT_ACCESS_TTL_SECONDS", 900),
  refreshTokenTtlDays: numberEnv("REFRESH_TOKEN_TTL_DAYS", 30),
  byokEncryptionKey: required("BYOK_ENCRYPTION_KEY"),
  dailyTurnCap: numberEnv("DAILY_TURN_CAP", 25),
  // Optional, not required() — monitoring is a nice-to-have, not something
  // that should stop the server from starting for local dev or if it's
  // simply not configured yet. See index.ts.
  sentryDsn: process.env.SENTRY_DSN,
  // Optional: natural server-side voice (Google Chirp 3 HD). Unset = clients use their local voice.
  googleTtsApiKey: process.env.GOOGLE_TTS_API_KEY || undefined,
  ttsVoice: process.env.TTS_VOICE || "Aoede",
  // Keep under Google's free 1M characters/month by default; beyond it, clients fall back to local voice.
  ttsMonthlyCharCap: numberEnv("TTS_MONTHLY_CHAR_CAP", 900_000),
};
