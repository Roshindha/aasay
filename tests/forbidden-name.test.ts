import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The pattern is built from char codes so this file does not itself contain the name.
const NAME = String.fromCharCode(115, 99, 111, 117, 116);
const RE = new RegExp(NAME, "i");
const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".assay-cache", "coverage"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

describe("forbidden former project name", () => {
  const files = walk(ROOT);
  it("scans a meaningful number of files", () => { expect(files.length).toBeGreaterThan(40); });
  it("does not appear in any file path", () => {
    expect(files.map((f) => path.relative(ROOT, f)).filter((p) => RE.test(p))).toEqual([]);
  });
  it("does not appear in any file content (case-insensitive)", () => {
    const hits = files.filter((f) => {
      return RE.test(fs.readFileSync(f).toString("utf8"));
    }).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
  it("does not appear in the git history's commit messages", () => {
    // best effort: .git/logs/HEAD holds commit subjects
    const log = path.join(ROOT, ".git", "logs", "HEAD");
    if (fs.existsSync(log)) expect(RE.test(fs.readFileSync(log, "utf8"))).toBe(false);
  });
});
