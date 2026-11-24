import { describe, expect, it } from "vitest";
import { FindingSchema, LaneSchema } from "@/core/types";

describe("core types", () => {
  it("lists five lanes including phantom-dependency and authorship", () => {
    expect(LaneSchema.options).toContain("phantom-dependency");
    expect(LaneSchema.options).toHaveLength(5);
  });
  it("parses a finding and applies defaults", () => {
    const f = FindingSchema.parse({
      id: "x", lane: "hallucination", severity: "high", label: "likely",
      file: "a.ts", line: 3, title: "t", detail: "d",
    });
    expect(f.evidence).toEqual([]);
    expect(f.lanes).toEqual([]);
  });
  it("rejects an unknown lane", () => {
    expect(() => LaneSchema.parse("nope")).toThrow();
  });
});
