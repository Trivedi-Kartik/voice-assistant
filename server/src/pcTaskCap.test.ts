import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, number>();
vi.mock("./redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: number, _ex: string, _ttl: number, nx?: string) => (nx === "NX" && store.has(k) ? null : (store.set(k, v), "OK"))),
    incr: vi.fn(async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n; }),
  },
}));
vi.mock("./db.js", () => ({ db: {} }));
vi.mock("./env.js", () => ({ env: { pcTaskDailyCap: 2, dailyTurnCap: 25 } }));

const { checkAndConsumePcTask } = await import("./rateLimit.js");

describe("checkAndConsumePcTask (per-user daily PC-task allowance on the shared key)", () => {
  beforeEach(() => store.clear());

  it("allows up to the cap, then refuses", async () => {
    expect((await checkAndConsumePcTask("u1", false)).allowed).toBe(true);
    expect((await checkAndConsumePcTask("u1", false)).allowed).toBe(true);
    expect(await checkAndConsumePcTask("u1", false)).toEqual({ allowed: false, remaining: 0 });
  });

  it("counts each user separately", async () => {
    await checkAndConsumePcTask("u1", false);
    await checkAndConsumePcTask("u1", false);
    expect((await checkAndConsumePcTask("u2", false)).allowed).toBe(true);
  });

  it("never caps users with their own Groq key", async () => {
    for (let i = 0; i < 10; i++) expect((await checkAndConsumePcTask("u1", true)).allowed).toBe(true);
    expect(store.size).toBe(0);
  });
});
