import { describe, expect, it } from "vitest";
import { hallucinationLane } from "@/lanes/hallucination";
import { specDriftLane } from "@/lanes/spec-drift";
import { testTheaterLane } from "@/lanes/test-theater";

const f = (path: string, content: string) => ({ path, content });
const run = (lane: typeof hallucinationLane, files: ReturnType<typeof f>[]) => lane({ files });

describe("hallucination lane", () => {
  it("flags a named import the target does not export, and not ones it does", () => {
    const out = run(hallucinationLane, [
      f("a.ts", `import { real, ghost } from "./b";\nimport def from "./b";`),
      f("b.ts", `export function real() {}\nexport const other = 1;`),
    ]);
    expect(out.map((x) => x.title)).toEqual([expect.stringContaining("`ghost` is not exported"), expect.stringContaining("no default export")]);
    expect(out[0]!.line).toBe(1);
  });
  it("respects export *, re-exports and aliases", () => {
    expect(run(hallucinationLane, [f("a.ts", `import { x } from "./b";`), f("b.ts", `export * from "./c";`), f("c.ts", `export const x=1`)])).toEqual([]);
    expect(run(hallucinationLane, [f("a.ts", `import { y } from "./b";`), f("b.ts", `const x=1; export { x as y };`)])).toEqual([]);
  });
  it("flags invented stdlib APIs but not ones in comments/strings or locally defined", () => {
    const out = run(hallucinationLane, [
      f("a.ts", `// Promise.allResolved(x)\nconst s = "JSON.tryParse(";\nJSON.tryParse(x);`),
      f("b.py", `# json.parse(x)\nimport json\njson.parse(x)\njson.loads(x)`),
    ]);
    expect(out.map((x) => [x.file, x.line])).toEqual([["a.ts", 3], ["b.py", 3]]);
  });
  it("flags python from-import of a name the local module lacks", () => {
    const out = run(hallucinationLane, [f("app/a.py", `from helpers import good, bad`), f("app/helpers.py", `def good():\n    pass\n`)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toContain("`bad`");
  });
  it("does not flag clean code", () => {
    expect(run(hallucinationLane, [f("a.ts", `import fs from "fs";\nimport { z } from "zod";\nPromise.all([]);`)])).toEqual([]);
  });
});

describe("spec-drift lane", () => {
  const spec = f("SPEC.md", "- `LIMIT` = `10`\n- `add(a, b)` adds.\n");
  it("flags constant mismatches and parameter-count drift", () => {
    const out = run(specDriftLane, [spec, f("x.ts", `export const LIMIT = 11;\nexport function add(a: number, b: number, c: number) { return a; }`)]);
    expect(out.map((x) => x.line).sort()).toEqual([1, 2]);
  });
  it("stays quiet when code matches the spec", () => {
    expect(run(specDriftLane, [spec, f("x.ts", `export const LIMIT = 10;\nexport const add = (a: number, b: number) => a + b;`)])).toEqual([]);
    expect(run(specDriftLane, [spec, f("x.py", `LIMIT = 10\ndef add(a, b):\n    return a + b\n`)])).toEqual([]);
  });
});

describe("test-theater lane", () => {
  it("flags no-assertion, tautology, skip, and self-mock in TS", () => {
    const src = [
      `import { vi, it, expect } from "vitest";`,
      `vi.mock("./thing");`,
      `it("no asserts", () => { thing(); });`,
      `it("taut", () => { expect(true).toBe(true); });`,
      `it.skip("later", () => {});`,
      `it("real", () => { expect(thing()).toBe(2); });`,
    ].join("\n");
    const out = run(testTheaterLane, [f("thing.test.ts", src)]);
    expect(out.map((x) => x.line).sort()).toEqual([2, 3, 4, 5]);
  });
  it("flags python no-assertion, tautology, skip; ignores real asserts", () => {
    const src = `import pytest\n\ndef test_a():\n    x = 1\n\ndef test_b():\n    assert True\n\n@pytest.mark.skip\ndef test_c():\n    assert 1\n\ndef test_d():\n    assert 1 + 1 == 2\n`;
    const out = run(testTheaterLane, [f("test_x.py", src)]);
    expect(out.map((x) => x.line)).toEqual([3, 7, 10]);
  });
  it("ignores non-test files", () => {
    expect(run(testTheaterLane, [f("x.ts", `it("x", () => {});`)])).toEqual([]);
  });
});
