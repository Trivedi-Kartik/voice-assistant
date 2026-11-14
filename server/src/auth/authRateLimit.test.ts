import { describe, expect, it, vi, beforeEach } from "vitest";

const store = new Map<string, number>();
const failing = { value: false };
vi.mock("../redis.js", () => ({
  redis: {
    set: vi.fn(async (k: string, v: number, _ex: string, _ttl: number, nx?: string) => {
      if (failing.value) throw new Error("redis down");
      if (nx === "NX" && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    }),
    incr: vi.fn(async (k: string) => {
      const n = (store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    }),
    ttl: vi.fn(async () => 42),
  },
}));

import { rateLimit } from "./authRateLimit.js";

function run(mw: ReturnType<typeof rateLimit>, req: object = {}) {
  const res = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown,
    setHeader(k: string, v: string) { this.headers[k] = v; }, status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  return mw(req as never, res as never, next).then(() => ({ res, next }));
}

describe("rateLimit middleware", () => {
  beforeEach(() => { store.clear(); failing.value = false; });
  const mw = rateLimit({ name: "t", limit: 3, windowSeconds: 60, keys: () => ["ip:1"] });

  it("allows up to the limit, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) expect((await run(mw)).next).toHaveBeenCalled();
    const blocked = await run(mw);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers["Retry-After"]).toBe("42");
  });

  it("counts each key independently", async () => {
    const two = rateLimit({ name: "t2", limit: 1, windowSeconds: 60, keys: (r) => [(r as unknown as { k?: string }).k ?? "x"] });
    expect((await run(two, { k: "a" })).next).toHaveBeenCalled();
    expect((await run(two, { k: "b" })).next).toHaveBeenCalled();
    expect((await run(two, { k: "a" })).res.statusCode).toBe(429);
  });

  it("fails open when Redis is down (an outage must not lock everyone out)", async () => {
    failing.value = true;
    const out = await run(mw);
    expect(out.next).toHaveBeenCalled();
    expect(out.res.statusCode).toBe(200);
  });
});
