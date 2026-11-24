import { describe, expect, it } from "vitest";
import { createLimiter } from "@/core/rate-limit";

describe("rate limiter", () => {
  it("allows up to max hits per window, then blocks with a retry time", () => {
    let t = 0;
    const limit = createLimiter(2, 1000, () => t);
    expect(limit("a").ok).toBe(true);
    expect(limit("a").ok).toBe(true);
    const blocked = limit("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
  });
  it("tracks keys separately and allows again after the window", () => {
    let t = 0;
    const limit = createLimiter(1, 1000, () => t);
    expect(limit("a").ok).toBe(true);
    expect(limit("b").ok).toBe(true);
    expect(limit("a").ok).toBe(false);
    t = 1001;
    expect(limit("a").ok).toBe(true);
  });
});
