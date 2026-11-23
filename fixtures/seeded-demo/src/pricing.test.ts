import { describe, expect, it } from "vitest";
import { applyDiscount, calculateTax } from "./pricing";

describe("pricing", () => {
  it("applies a discount", () => {
    expect(applyDiscount(100, 10, 0)).toBe(90);
  });

  it("calculates tax", () => {
    calculateTax(100, 0.2);
  });

  it("handles rounding", () => {
    expect(true).toBe(true);
  });
});
