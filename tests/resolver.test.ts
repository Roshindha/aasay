import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RegistryClient } from "@/deps/registry";
import { analyzeDependencies, phantomLabel } from "@/deps/resolver";
import { emptyDeclared } from "@/deps/manifests";

const f = (p: string, c: string) => ({ path: p, content: c });
let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assay-reg-")); });

function mockFetch(table: Record<string, number>) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const status = table[url] ?? 404;
    return new Response(status === 200 ? "{}" : "nf", { status });
  };
  return { impl, calls };
}

describe("registry client (mocked HTTP)", () => {
  it("online: 200 exists, 404 not-found, 5xx unknown; caches to disk", async () => {
    const { impl, calls } = mockFetch({ "https://registry.npmjs.org/real-pkg-xyz": 200, "https://registry.npmjs.org/boom-pkg-xyz": 503 });
    const mk = () => new RegistryClient({ mode: "online", cacheDir: tmp, fetchImpl: impl, fixturesPath: "/nonexistent" });
    const c = mk();
    expect((await c.check("npm", "real-pkg-xyz")).status).toBe("exists");
    expect((await c.check("npm", "ghost-pkg-xyz")).status).toBe("not-found");
    expect((await c.check("npm", "boom-pkg-xyz")).status).toBe("unknown");
    expect(calls).toHaveLength(3);
    const c2 = mk(); // fresh instance reads disk cache
    const r = await c2.check("npm", "real-pkg-xyz");
    expect(r).toMatchObject({ status: "exists", source: "cache" });
    expect(calls).toHaveLength(3);
    await c2.check("npm", "boom-pkg-xyz"); // unknown is not cached
    expect(calls).toHaveLength(4);
  });

  it("encodes scoped npm names and uses pypi JSON endpoint", async () => {
    const { impl, calls } = mockFetch({});
    const c = new RegistryClient({ mode: "online", cacheDir: tmp, fetchImpl: impl, fixturesPath: "/nonexistent" });
    await c.check("npm", "@zz-scope/pkg-q");
    await c.check("pypi", "Zz_Ghost.Pkg");
    expect(calls).toEqual(["https://registry.npmjs.org/@zz-scope%2Fpkg-q", "https://pypi.org/pypi/zz-ghost-pkg/json"]);
  });

  it("offline: never fetches; fixtures and popular snapshot answer, others unknown", async () => {
    const { impl, calls } = mockFetch({});
    const c = new RegistryClient({ mode: "offline", cacheDir: tmp, fetchImpl: impl });
    expect((await c.check("npm", "react")).source).toBe("popular-snapshot");
    expect((await c.check("npm", "express-validator-pro")).status).toBe("not-found");
    expect((await c.check("npm", "totally-unlisted-zzz")).status).toBe("unknown");
    expect(calls).toHaveLength(0);
  });

  it("returns unknown (not a throw) on network errors", async () => {
    const c = new RegistryClient({ mode: "online", cacheDir: tmp, fixturesPath: "/nonexistent", fetchImpl: async () => { throw new Error("down"); } });
    expect((await c.check("pypi", "zz-unlisted")).status).toBe("unknown");
  });
});

describe("phantomLabel", () => {
  const d = emptyDeclared();
  it("404 => confirmed, except scoped or custom registry => likely", () => {
    expect(phantomLabel("npm", "ghost", "not-found", d)).toBe("confirmed");
    expect(phantomLabel("npm", "@acme/ghost", "not-found", d)).toBe("likely");
    expect(phantomLabel("pypi", "ghost", "not-found", d)).toBe("confirmed");
    const custom = emptyDeclared(); custom.customRegistry.npm = true; custom.customRegistry.pypi = true;
    expect(phantomLabel("npm", "ghost", "not-found", custom)).toBe("likely");
    expect(phantomLabel("pypi", "ghost", "not-found", custom)).toBe("likely");
    expect(phantomLabel("npm", "x", "exists", d)).toBe("likely");
    expect(phantomLabel("npm", "x", "unknown", d)).toBe("speculative");
  });
});

describe("analyzeDependencies", () => {
  const client = () => new RegistryClient({ mode: "offline", cacheDir: tmp });
  it("treats builtins, node:, relative, aliases, local py modules, stdlib as declared", async () => {
    const files = [
      f("package.json", JSON.stringify({ name: "app", dependencies: { react: "1" } })),
      f("tsconfig.json", `{"compilerOptions":{"paths":{"@/*":["src/*"]}}}`),
      f("src/a.ts", `import fs from "fs";\nimport p from "node:path";\nimport r from "react";\nimport l from "./l";\nimport x from "@/x";\nimport me from "app/sub";\nimport fsp from "fs/promises";`),
      f("tool/main.py", `import os\nimport json\nimport helpers\nfrom . import y\n`),
      f("tool/helpers.py", `x = 1\n`),
    ];
    const rep = await analyzeDependencies(files, client());
    expect(rep.issues).toEqual([]);
  });

  it("reports undeclared imports with correct labels and typosquats", async () => {
    const files = [
      f("package.json", JSON.stringify({ dependencies: { react: "1" } })),
      f("a.ts", `import a from "express-validator-pro";\nimport b from "lodahs";\nimport c from "@acme/ghost";\nimport d from "lodash";`),
      f("requirements.txt", "requests\n"),
      f("m.py", `import fastjsonvalidate\nimport yaml\nimport requests\n`),
    ];
    const rep = await analyzeDependencies(files, client());
    const by = (n: string) => rep.issues.filter((i) => i.packageName === n);
    expect(by("express-validator-pro").map((i) => [i.kind, i.label, i.registryStatus])).toEqual([["phantom", "confirmed", "not-found"]]);
    expect(by("lodahs").some((i) => i.kind === "typosquat" && i.typosquatOf === "lodash" && i.label === "likely")).toBe(true);
    expect(by("@acme/ghost")[0]!.registryStatus).toBe("unknown"); // offline miss
    expect(by("lodash").map((i) => i.kind)).toEqual(["phantom"]);
    expect(by("fastjsonvalidate")[0]).toMatchObject({ label: "confirmed", registry: "pypi" });
    expect(by("PyYAML")[0]).toMatchObject({ kind: "phantom", registryStatus: "exists" });
    expect(by("requests")).toEqual([]);
  });

  it("flags lockfile-only (transitive) imports", async () => {
    const files = [
      f("package.json", JSON.stringify({ dependencies: { a: "1" } })),
      f("package-lock.json", JSON.stringify({ packages: { "": { dependencies: { a: "1" } }, "node_modules/a": {}, "node_modules/inner-dep": {} } })),
      f("x.ts", `import i from "inner-dep";`),
    ];
    const rep = await analyzeDependencies(files, client());
    expect(rep.issues.map((i) => i.kind)).toEqual(["transitive-only"]);
  });
});
