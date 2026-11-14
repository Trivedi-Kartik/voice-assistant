import { describe, expect, it } from "vitest";
import { trimHistory } from "./historyTrim.js";
import type { ChatMessage } from "../llm.js";

const sys: ChatMessage = { role: "system", content: "s" };
const turn = (n: number): ChatMessage[] => [
  { role: "user", content: `u${n}` },
  { role: "assistant", content: "", tool_calls: [{ id: `c${n}`, type: "function", function: { name: "x", arguments: "{}" } }] } as ChatMessage,
  { role: "tool", tool_call_id: `c${n}`, content: "{}" } as ChatMessage,
  { role: "assistant", content: `a${n}` },
];

describe("trimHistory", () => {
  it("leaves short histories untouched (same array)", () => {
    const h = [sys, ...turn(1), ...turn(2)];
    expect(trimHistory(h, 5)).toBe(h);
  });

  it("keeps the system prompt and only the last N whole turns", () => {
    const h = [sys, ...turn(1), ...turn(2), ...turn(3), ...turn(4)];
    const out = trimHistory(h, 2);
    expect(out[0]).toBe(sys);
    expect(out.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["u3", "u4"]);
    expect(out.length).toBe(1 + 8);
  });

  it("never orphans a tool message from its assistant tool_calls", () => {
    const out = trimHistory([sys, ...turn(1), ...turn(2), ...turn(3)], 1);
    expect(out[1].role).toBe("user");
    const ids = out.flatMap((m) => ((m as { tool_calls?: { id: string }[] }).tool_calls ?? []).map((c) => c.id));
    for (const m of out) if (m.role === "tool") expect(ids).toContain((m as { tool_call_id: string }).tool_call_id);
  });
});
