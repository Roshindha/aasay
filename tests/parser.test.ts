import { describe, expect, it } from "vitest";
import { parseJsImports, parsePythonImports } from "@/deps/parser";
import { specifierToNpmName, normalizePyName } from "@/deps/names";

const names = (xs: { packageName: string | null }[]) => xs.map((x) => x.packageName);

describe("JS/TS parser", () => {
  it("handles every import form with line numbers", () => {
    const src = [
      `import React from "react";`,
      `import { a, b } from '@scope/pkg/sub/path';`,
      `import * as ns from "lodash/fp";`,
      `import type { T } from "type-only-pkg";`,
      `import "side-effect-pkg";`,
      `export { x } from "reexported";`,
      `export * from "star-export";`,
      `const m = await import("dyn-pkg");`,
      `const r = require("req-pkg");`,
      `import local from "./local";`,
    ].join("\n");
    const res = parseJsImports(src);
    const byLine = Object.fromEntries(res.map((r) => [r.line, r]));
    expect(byLine[1]!.packageName).toBe("react");
    expect(byLine[2]!.packageName).toBe("@scope/pkg");
    expect(byLine[3]!.packageName).toBe("lodash");
    expect(byLine[4]!.kind).toBe("type-import");
    expect(byLine[4]!.packageName).toBe("type-only-pkg");
    expect(byLine[5]!.packageName).toBe("side-effect-pkg");
    expect(byLine[6]!.kind).toBe("export-from");
    expect(byLine[7]!.kind).toBe("export-from");
    expect(byLine[8]!.kind).toBe("dynamic-import");
    expect(byLine[9]!.kind).toBe("require");
    expect(byLine[10]!.packageName).toBeNull();
    expect(res).toHaveLength(10);
  });

  it("ignores imports inside comments and strips multi-line imports correctly", () => {
    const src = `// import fake from "fake-line"\n/* require("fake-block") */\nimport {\n  a,\n  b,\n} from "real-pkg";\nconst s = "import x from 'in-string'";`;
    const res = parseJsImports(src);
    expect(names(res)).toEqual(["real-pkg"]);
    expect(res[0]!.line).toBe(6);
  });

  it("keeps node: prefixed specifiers and normalizes names", () => {
    expect(specifierToNpmName("node:fs/promises")).toBe("node:fs/promises");
    expect(specifierToNpmName("@a/b/c")).toBe("@a/b");
    expect(specifierToNpmName("a/b/c")).toBe("a");
    expect(specifierToNpmName("../x")).toBeNull();
    expect(specifierToNpmName("https://x.y/z")).toBeNull();
  });

  it("does not treat obj.require() as a require call", () => {
    expect(parseJsImports(`mod.require("nope");`)).toHaveLength(0);
  });
});

describe("Python parser", () => {
  it("parses import and from-import, skipping relative", () => {
    const src = [
      `import os, sys`,
      `import yaml`,
      `import numpy as np`,
      `from PIL import Image`,
      `from . import sibling`,
      `from ..pkg import thing`,
      `from requests.adapters import HTTPAdapter`,
      `import a.b.c`,
    ].join("\n");
    const res = parsePythonImports(src);
    expect(res.map((r) => [r.line, r.packageName])).toEqual([
      [1, "os"], [1, "sys"], [2, "PyYAML"], [3, "numpy"], [4, "Pillow"], [7, "requests"], [8, "a"],
    ]);
  });

  it("ignores comments and docstrings", () => {
    const src = `"""\nimport fake_doc\n"""\n# import fake_comment\nx = 1  # import fake_tail\nimport real_one\n'''import fake2'''\n`;
    expect(parsePythonImports(src).map((r) => r.specifier)).toEqual(["real_one"]);
  });

  it("normalizes PEP 503 names", () => {
    expect(normalizePyName("Foo_Bar.baz")).toBe("foo-bar-baz");
  });
});
