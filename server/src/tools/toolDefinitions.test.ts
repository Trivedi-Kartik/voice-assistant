import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS } from "./toolDefinitions.js";
import { GROQ_TOOL_SCHEMAS, SERVER_TOOL_SCHEMAS, AUTOMATION_TOOL_SCHEMAS, SERVER_TOOL_NAMES, CONFIRMATION_PROMPTS } from "./schemas.js";
import { TOOL_NAMES } from "./toolNames.js";

// Phase 2 (Tool Fabric) — see docs/IMPLEMENTATION_ROADMAP.md. These tests exist
// to close a real gap found while planning this phase: no prior test asserted
// the ToolSchema shape itself, or locked down exactly which tools are
// confirmation-gated. That second point is the load-bearing "zero behavior
// change" guarantee for this refactor — schemas.ts's 3 arrays/map are now
// *derived* from TOOL_DEFINITIONS, and this file is what proves the
// derivation didn't silently change anything.

describe("Phase 2: TOOL_DEFINITIONS", () => {
  it("has exactly 11 definitions with unique ids matching the known tool set", () => {
    const expectedIds = new Set([...TOOL_NAMES, "remember_preference", "computer_use_task"]);
    const ids = TOOL_DEFINITIONS.map((t) => t.id);
    expect(ids.length).toBe(11);
    expect(new Set(ids).size).toBe(11); // no duplicates
    expect(new Set(ids)).toEqual(expectedIds);
  });

  it("assigns exactly the 5 tools known to be confirmation-gated today, and no others", () => {
    const gated = TOOL_DEFINITIONS.filter((t) => t.confirmationPrompt).map((t) => t.id).sort();
    expect(gated).toEqual(
      ["add_custom_app", "close_app", "computer_use_task", "read_clipboard", "take_screenshot_and_describe"].sort()
    );
  });

  it("every non-low-risk tool has a confirmationPrompt, and every low-risk tool does not", () => {
    for (const t of TOOL_DEFINITIONS) {
      if (t.riskLevel === "low") {
        expect(t.confirmationPrompt).toBeUndefined();
      } else {
        expect(t.confirmationPrompt).toBeTypeOf("function");
      }
    }
  });

  it("classifies kind consistently with today's 3-array split", () => {
    const byKind = (kind: string) => TOOL_DEFINITIONS.filter((t) => t.kind === kind).map((t) => t.id).sort();
    expect(byKind("client")).toEqual([...TOOL_NAMES].sort());
    expect(byKind("server")).toEqual(["remember_preference"]);
    expect(byKind("automation")).toEqual(["computer_use_task"]);
  });

  it("no tool implements verify() yet — reserved for Phase 5", () => {
    for (const t of TOOL_DEFINITIONS) {
      expect(t.verify).toBeUndefined();
    }
  });
});

describe("Phase 2: derived schemas.ts exports match TOOL_DEFINITIONS exactly", () => {
  it("GROQ_TOOL_SCHEMAS has one entry per client tool, name/description/parameters matching", () => {
    const clientDefs = TOOL_DEFINITIONS.filter((t) => t.kind === "client");
    expect(GROQ_TOOL_SCHEMAS.length).toBe(clientDefs.length);
    for (const def of clientDefs) {
      const schema = GROQ_TOOL_SCHEMAS.find((s) => s.function.name === def.id);
      expect(schema).toBeDefined();
      expect(schema!.type).toBe("function");
      expect(schema!.function.description).toBe(def.description);
      expect(schema!.function.parameters).toEqual(def.inputSchema);
    }
  });

  it("SERVER_TOOL_SCHEMAS / SERVER_TOOL_NAMES contain exactly remember_preference", () => {
    expect(SERVER_TOOL_SCHEMAS.map((s) => s.function.name)).toEqual(["remember_preference"]);
    expect(SERVER_TOOL_NAMES).toEqual(new Set(["remember_preference"]));
  });

  it("AUTOMATION_TOOL_SCHEMAS contains exactly computer_use_task", () => {
    expect(AUTOMATION_TOOL_SCHEMAS.map((s) => s.function.name)).toEqual(["computer_use_task"]);
  });

  it("CONFIRMATION_PROMPTS has exactly the 5 gated keys, with the exact live prompt text", () => {
    expect(Object.keys(CONFIRMATION_PROMPTS).sort()).toEqual(
      ["add_custom_app", "close_app", "computer_use_task", "read_clipboard", "take_screenshot_and_describe"].sort()
    );
    expect(CONFIRMATION_PROMPTS.close_app!({ app: "chrome" })).toBe("Close chrome? Say yes to confirm.");
    expect(CONFIRMATION_PROMPTS.read_clipboard!({})).toBe("Share your clipboard with me? Say yes to confirm.");
  });
});
