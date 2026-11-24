import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

describe("README", () => {
  it.each(["## What it checks", "## Run it", "## Use it from an AI tool (MCP)", "## How it works", "## Limits", "## How this was built"])("has %s", (h) => {
    expect(readme).toContain(h);
  });
  it("includes an MCP config snippet with the server name", () => {
    expect(readme).toContain('"assay"');
  });
  it("says the benchmarks do not measure real-world accuracy", () => {
    expect(readme).toMatch(/not real-world accuracy/);
  });
  it("says authorship results are signals, not verdicts", () => {
    expect(readme).toMatch(/signals, never a verdict/);
    expect(readme).toMatch(/not proof a human wrote the code/);
  });
  it("every screenshot it references exists", () => {
    const refs = [...readme.matchAll(/\((docs\/screenshots\/[^)]+\.png)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const r of refs) expect(fs.existsSync(path.resolve(__dirname, "..", r)), r).toBe(true);
  });
  it("ships the architecture doc", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../docs/ARCHITECTURE.md"))).toBe(true);
  });
});
