import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { plannerProvider: null as string | null, plannerModel: null as string | null, plannerApiKeyEnc: null as Buffer | null };
vi.mock("../db.js", () => ({ db: { user: { findUniqueOrThrow: vi.fn(async () => ({ ...user })) } } }));
vi.mock("../crypto.js", () => ({ decryptApiKey: vi.fn(() => "decrypted-user-key") }));
vi.mock("../groqKey.js", () => ({ resolveGroqKey: vi.fn(async () => ({ apiKey: "groq-key", isByok: false })) }));

const { selectPlanner } = await import("./plannerSelection.js");
const { GroqPlanner } = await import("./planner.js");
const { OpenAiCompatiblePlanner, AnthropicPlanner } = await import("./providers.js");

beforeEach(() => Object.assign(user, { plannerProvider: null, plannerModel: null, plannerApiKeyEnc: null }));

describe("selectPlanner", () => {
  it("defaults to Groq (shared key, capped)", async () => {
    const s = await selectPlanner("u1");
    expect(s.planner).toBeInstanceOf(GroqPlanner);
    expect(s).toMatchObject({ usesOwnKey: false, label: "Groq (default)" });
  });
  it("uses the user's own provider only when fully configured, and exempts them from the shared-key cap", async () => {
    Object.assign(user, { plannerProvider: "anthropic", plannerModel: "claude-sonnet-4-5", plannerApiKeyEnc: Buffer.from("x") });
    const s = await selectPlanner("u1");
    expect(s.planner).toBeInstanceOf(AnthropicPlanner);
    expect(s.usesOwnKey).toBe(true);
    Object.assign(user, { plannerProvider: "openrouter" });
    expect((await selectPlanner("u1")).planner).toBeInstanceOf(OpenAiCompatiblePlanner);
  });
  it("a half-configured or unknown provider is ignored (Groq), never half-used", async () => {
    Object.assign(user, { plannerProvider: "openai", plannerModel: "gpt-4.1-mini", plannerApiKeyEnc: null });
    expect((await selectPlanner("u1")).planner).toBeInstanceOf(GroqPlanner);
    Object.assign(user, { plannerProvider: "evil-host", plannerModel: "m", plannerApiKeyEnc: Buffer.from("x") });
    expect((await selectPlanner("u1")).planner).toBeInstanceOf(GroqPlanner);
  });
});
