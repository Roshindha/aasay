import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

describe("README", () => {
  it.each(["## Setup", "## MCP client configuration", "## How the Phantom Dependency lane works", "## Honest limitations", "## Authorship & disclosure audit", "## Architecture", "## How this was built", "## Acknowledgements"])("has %s", (h) => {
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
  it("every screenshot it references exists", () => {
    const refs = [...readme.matchAll(/\((docs\/screenshots\/[^)]+\.png)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThanOrEqual(18);
    for (const r of refs) expect(fs.existsSync(path.resolve(__dirname, "..", r)), r).toBe(true);
  });
  it("documents the authorship limits: signals not verdicts, style unreliable, self-authored benchmark", () => {
    expect(readme).toMatch(/reports signals, not verdicts/);
    expect(readme).toMatch(/Style-based detection of AI-written code is unreliable/);
    expect(readme).toMatch(/Both benchmarks are self-authored/);
    expect(readme).toMatch(/\*\*not\*\* proof of human authorship/);
  });
  it("ships a LICENSE, CONTRIBUTING and ARCHITECTURE doc", () => {
    for (const f of ["LICENSE", "CONTRIBUTING.md", "docs/ARCHITECTURE.md"]) expect(fs.existsSync(path.resolve(__dirname, "..", f)), f).toBe(true);
    expect(fs.readFileSync(path.resolve(__dirname, "../LICENSE"), "utf8")).toMatch(/^MIT License/);
  });
});
