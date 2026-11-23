import { describe, expect, it } from "vitest";
import { collectDeclared, parseJsonc, pyRequirementName } from "@/deps/manifests";

const f = (path: string, content: string) => ({ path, content });

describe("manifest parsing", () => {
  it("package.json: all four dependency sections + name", () => {
    const d = collectDeclared([f("package.json", JSON.stringify({ name: "me", dependencies: { a: "1" }, devDependencies: { b: "1" }, peerDependencies: { c: "1" }, optionalDependencies: { d: "1" } }))]);
    expect([...d.npmDirect].sort()).toEqual(["a", "b", "c", "d"]);
    expect(d.selfNames.has("me")).toBe(true);
  });

  it("pnpm-lock.yaml (importers + packages)", () => {
    const y = `lockfileVersion: '6.0'\nimporters:\n  .:\n    dependencies:\n      react:\n        specifier: ^19\n        version: 19.0.0\npackages:\n  /react@19.0.0:\n    resolution: {}\n  /@scope/trans@1.0.0:\n    resolution: {}\n`;
    const d = collectDeclared([f("pnpm-lock.yaml", y)]);
    expect(d.npmDirect.has("react")).toBe(true);
    expect(d.npmLockOnly.has("@scope/trans")).toBe(true);
  });

  it("package-lock.json and yarn.lock", () => {
    const pl = { packages: { "": { dependencies: { x: "1" } }, "node_modules/x": {}, "node_modules/x/node_modules/y": {} } };
    const d = collectDeclared([f("package-lock.json", JSON.stringify(pl)), f("yarn.lock", `"@a/b@^1.0.0", "@a/b@^1.1.0":\n  version "1"\n\nzed@^2:\n  version "2"\n`)]);
    expect(d.npmDirect.has("x")).toBe(true);
    expect(d.npmLockOnly.has("y")).toBe(true);
    expect(d.npmLockOnly.has("@a/b")).toBe(true);
    expect(d.npmLockOnly.has("zed")).toBe(true);
  });

  it("requirements*.txt incl. extras, markers, urls, custom index", () => {
    const d = collectDeclared([f("requirements-dev.txt", `# c\nRequests[security]>=2.0 ; python_version>"3"\nPyYAML==6\n-r other.txt\n--extra-index-url https://my.corp/simple\ngit+https://x/y.git#egg=Foo_Bar\n`)]);
    expect([...d.pyDirect].sort()).toEqual(["foo-bar", "pyyaml", "requests"]);
    expect(d.customRegistry.pypi).toBe(true);
  });

  it("pyproject.toml PEP 621 and poetry; Pipfile; poetry.lock", () => {
    const pep = `[project]\nname="x"\ndependencies=["httpx>=0.2","Pydantic_Core"]\n[project.optional-dependencies]\ndev=["pytest"]\n`;
    const poetry = `[tool.poetry.dependencies]\npython="^3.11"\nfastapi="^0.1"\n[tool.poetry.group.test.dependencies]\nhypothesis="*"\n[[tool.poetry.source]]\nname="corp"\nurl="https://corp/simple"\n`;
    const d1 = collectDeclared([f("pyproject.toml", pep)]);
    expect([...d1.pyDirect].sort()).toEqual(["httpx", "pydantic-core", "pytest"]);
    const d2 = collectDeclared([f("sub/pyproject.toml", poetry), f("Pipfile", `[packages]\nFlask="*"\n[dev-packages]\nblack="*"\n`), f("poetry.lock", `[[package]]\nname = "Trans_Dep"\nversion = "1"\n`)]);
    expect([...d2.pyDirect].sort()).toEqual(["black", "fastapi", "flask", "hypothesis"]);
    expect(d2.pyLockOnly.has("trans-dep")).toBe(true);
    expect(d2.customRegistry.pypi).toBe(true);
  });

  it("tsconfig paths/baseUrl (JSONC) and .npmrc registries", () => {
    const ts = `{\n // c\n "compilerOptions": { "baseUrl": "src", "paths": { "@/*": ["./src/*"], "~lib/*": ["lib/*"], }, }\n}`;
    expect(() => parseJsonc(ts)).not.toThrow();
    const d = collectDeclared([f("tsconfig.json", ts), f(".npmrc", `registry=https://npm.corp/\n@acme:registry=https://npm.acme/\n`)]);
    expect(d.aliasPrefixes).toEqual(["@/", "~lib/"]);
    expect(d.baseUrls).toEqual(["src"]);
    expect(d.customRegistry.npm).toBe(true);
    expect(d.customRegistry.npmScopes.has("@acme")).toBe(true);
  });

  it("reports malformed manifests as warnings without throwing", () => {
    const d = collectDeclared([f("package.json", "{ nope")]);
    expect(d.warnings).toHaveLength(1);
  });

  it("pyRequirementName edge cases", () => {
    expect(pyRequirementName("numpy~=1.2")).toBe("numpy");
    expect(pyRequirementName("-e .")).toBeNull();
    expect(pyRequirementName("   # only comment")).toBeNull();
  });
});
