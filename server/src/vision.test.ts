import { describe, expect, it } from "vitest";
import { parseLocation } from "./vision.js";

describe("parseLocation (model answer -> a safe click target)", () => {
  it("accepts a clean answer and normalizes to 0..1", () => {
    expect(parseLocation('{"found":true,"x":250,"y":750}')).toEqual({ x: 0.25, y: 0.75 });
  });
  it("tolerates code fences and surrounding prose", () => {
    expect(parseLocation('Sure!\n```json\n{"found": true, "x": 500, "y": 500}\n```')).toEqual({ x: 0.5, y: 0.5 });
  });
  it("returns null for not-found, malformed, non-numeric or out-of-range answers (never a guessed click)", () => {
    for (const raw of ['{"found":false}', "I can't see it", "", "{", '{"found":true,"x":"left","y":2}', '{"found":true,"x":-5,"y":10}', '{"found":true,"x":1200,"y":10}', '{"found":true,"x":5}', '{"found":true,"x":1e999,"y":3}']) {
      expect(parseLocation(raw), raw).toBeNull();
    }
  });
});
