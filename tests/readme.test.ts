import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

describe("README", () => {
  it.each(["## Setup", "## MCP client configuration", "## How the Phantom Dependency lane works", "## Honest limitations"])("has %s", (h) => {
    expect(readme).toContain(h);
  });
  it("states the benchmark is self-authored and measures plumbing", () => {
    expect(readme).toMatch(/self-authored/i);
    expect(readme).toMatch(/plumbing/);
  });
  it("includes an MCP config snippet with the server name", () => {
    expect(readme).toContain('"assay"');
  });
  it("marks the popular lists as snapshots", () => { expect(readme).toMatch(/approximate snapshots/); });
});
