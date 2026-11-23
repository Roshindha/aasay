import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import type { SourceFile } from "@/core/types";
import { normalizePyName } from "./names";

export interface DeclaredDeps {
  /** Direct npm dependencies (package.json), keyed by name */
  npmDirect: Set<string>;
  /** npm packages present only in lockfiles (transitive) */
  npmLockOnly: Set<string>;
  /** Direct python dependencies, PEP 503 normalized */
  pyDirect: Set<string>;
  pyLockOnly: Set<string>;
  /** Package's own name (self imports) */
  selfNames: Set<string>;
  /** tsconfig path alias prefixes, e.g. "@/" , "~/" */
  aliasPrefixes: string[];
  /** tsconfig baseUrl directories (repo-relative) */
  baseUrls: string[];
  customRegistry: { npm: boolean; npmScopes: Set<string>; pypi: boolean };
  /** Manifest files that contributed, for the evidence graph */
  manifests: string[];
  /** Per-file parse problems (never thrown) */
  warnings: string[];
}

export function emptyDeclared(): DeclaredDeps {
  return {
    npmDirect: new Set(), npmLockOnly: new Set(), pyDirect: new Set(), pyLockOnly: new Set(),
    selfNames: new Set(), aliasPrefixes: [], baseUrls: [],
    customRegistry: { npm: false, npmScopes: new Set(), pypi: false },
    manifests: [], warnings: [],
  };
}

const base = (p: string) => p.split("/").pop() ?? p;

/** Strip // and /* comments and trailing commas from tsconfig-style JSONC. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!, d = text[i + 1];
    if (c === '"') {
      out += c; i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\") { out += text[i]!; i++; } out += text[i] ?? ""; i++; }
      out += '"'; i++;
    } else if (c === "/" && d === "/") { while (i < text.length && text[i] !== "\n") i++; }
    else if (c === "/" && d === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; }
    else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Parse a PEP 508 requirement line to a normalized distribution name, or null. */
export function pyRequirementName(line: string): string | null {
  const s = line.replace(/\s+#.*$/, "").trim();
  if (!s || s.startsWith("#") || s.startsWith("-") || /^(git\+|https?:|file:|\.|\/)/.test(s)) {
    const egg = /#egg=([A-Za-z0-9_.-]+)/.exec(line);
    return egg ? normalizePyName(egg[1]!) : null;
  }
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(s);
  return m ? normalizePyName(m[1]!) : null;
}

function parsePackageJson(text: string, d: DeclaredDeps, path: string) {
  const j = JSON.parse(text) as Record<string, unknown>;
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const sec = j[key];
    if (sec && typeof sec === "object") for (const n of Object.keys(sec)) d.npmDirect.add(n);
  }
  const bundled = j["bundledDependencies"] ?? j["bundleDependencies"];
  if (Array.isArray(bundled)) for (const n of bundled) if (typeof n === "string") d.npmDirect.add(n);
  if (typeof j["name"] === "string") d.selfNames.add(j["name"]);
  void path;
}

function parsePnpmLock(text: string, d: DeclaredDeps) {
  const y = parseYaml(text) as Record<string, unknown> | null;
  if (!y) return;
  const addDirect = (sec: unknown) => {
    if (sec && typeof sec === "object") for (const n of Object.keys(sec)) d.npmDirect.add(n);
  };
  const importers = y["importers"] as Record<string, Record<string, unknown>> | undefined;
  if (importers) for (const imp of Object.values(importers)) for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) addDirect(imp?.[k]);
  for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) addDirect(y[k]);
  for (const key of Object.keys((y["packages"] as object) ?? {}).concat(Object.keys((y["snapshots"] as object) ?? {}))) {
    const m = /^\/?((?:@[^/@]+\/)?[^/@(]+)@/.exec(key) ?? /^\/((?:@[^/]+\/)?[^/]+)\//.exec(key);
    if (m) d.npmLockOnly.add(m[1]!);
  }
}

function parsePackageLock(text: string, d: DeclaredDeps) {
  const j = JSON.parse(text) as { packages?: Record<string, { dependencies?: object; devDependencies?: object }>; dependencies?: Record<string, unknown> };
  const root = j.packages?.[""];
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const) {
    const sec = (root as Record<string, object> | undefined)?.[k];
    if (sec) for (const n of Object.keys(sec)) d.npmDirect.add(n);
  }
  for (const key of Object.keys(j.packages ?? {})) {
    const idx = key.lastIndexOf("node_modules/");
    if (idx >= 0) d.npmLockOnly.add(key.slice(idx + "node_modules/".length));
  }
  for (const n of Object.keys(j.dependencies ?? {})) d.npmLockOnly.add(n);
}

function parseYarnLock(text: string, d: DeclaredDeps) {
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.startsWith("#")) continue;
    for (const spec of line.replace(/:$/, "").split(",")) {
      const m = /^"?((?:@[^/@]+\/)?[^@\s"]+)@/.exec(spec.trim());
      if (m) d.npmLockOnly.add(m[1]!);
    }
  }
}

function parseRequirements(text: string, d: DeclaredDeps) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(--index-url|-i|--extra-index-url)\s*=?\s*(\S+)/.test(line)) {
      const url = /^(?:--index-url|-i|--extra-index-url)\s*=?\s*(\S+)/.exec(line)![1]!;
      if (!/^https:\/\/pypi\.org\b/.test(url)) d.customRegistry.pypi = true;
      continue;
    }
    const n = pyRequirementName(line);
    if (n) d.pyDirect.add(n);
  }
}

function parsePyproject(text: string, d: DeclaredDeps) {
  const t = parseToml(text) as Record<string, any>;
  const add = (arr: unknown) => {
    if (Array.isArray(arr)) for (const r of arr) if (typeof r === "string") { const n = pyRequirementName(r); if (n) d.pyDirect.add(n); }
  };
  add(t.project?.dependencies);
  for (const g of Object.values(t.project?.["optional-dependencies"] ?? {})) add(g);
  for (const g of Object.values(t["dependency-groups"] ?? {})) add(g);
  add(t["build-system"]?.requires);
  const poetry = t.tool?.poetry;
  if (poetry) {
    const addTbl = (tbl: unknown) => {
      if (tbl && typeof tbl === "object") for (const n of Object.keys(tbl)) if (n.toLowerCase() !== "python") d.pyDirect.add(normalizePyName(n));
    };
    addTbl(poetry.dependencies);
    addTbl(poetry["dev-dependencies"]);
    for (const g of Object.values<any>(poetry.group ?? {})) addTbl(g?.dependencies);
    for (const src of poetry.source ?? []) if (src?.url && !/pypi\.org/.test(src.url)) d.customRegistry.pypi = true;
  }
  for (const key of ["pip", "uv"]) {
    const url = t.tool?.[key]?.["index-url"];
    if (typeof url === "string" && !/pypi\.org/.test(url)) d.customRegistry.pypi = true;
  }
  if (t.tool?.uv?.index) d.customRegistry.pypi = true;
}

function parsePipfile(text: string, d: DeclaredDeps) {
  const t = parseToml(text) as Record<string, any>;
  for (const k of ["packages", "dev-packages"]) for (const n of Object.keys(t[k] ?? {})) d.pyDirect.add(normalizePyName(n));
  for (const s of t.source ?? []) if (s?.url && !/pypi\.org/.test(s.url)) d.customRegistry.pypi = true;
}

function parsePoetryLock(text: string, d: DeclaredDeps) {
  const t = parseToml(text) as { package?: Array<{ name?: string }> };
  for (const p of t.package ?? []) if (p.name) d.pyLockOnly.add(normalizePyName(p.name));
}

function parsePipfileLock(text: string, d: DeclaredDeps) {
  const j = JSON.parse(text) as Record<string, Record<string, unknown>>;
  for (const k of ["default", "develop"]) for (const n of Object.keys(j[k] ?? {})) d.pyLockOnly.add(normalizePyName(n));
}

function parseNpmrc(text: string, d: DeclaredDeps) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m = /^registry\s*=\s*(\S+)/.exec(line);
    if (m && !/^https:\/\/registry\.npmjs\.org\/?$/.test(m[1]!)) d.customRegistry.npm = true;
    m = /^(@[^:]+):registry\s*=\s*(\S+)/.exec(line);
    if (m) { d.customRegistry.npmScopes.add(m[1]!); }
  }
}

function parseTsconfig(text: string, d: DeclaredDeps) {
  const j = parseJsonc(text) as { compilerOptions?: { paths?: Record<string, unknown>; baseUrl?: string } };
  for (const key of Object.keys(j.compilerOptions?.paths ?? {})) {
    const prefix = key.replace(/\*$/, "");
    if (prefix) d.aliasPrefixes.push(prefix);
  }
  if (j.compilerOptions?.baseUrl) d.baseUrls.push(j.compilerOptions.baseUrl.replace(/^\.\/?/, ""));
}

/** Collect declared dependencies from every manifest/lockfile found among `files`. Never throws. */
export function collectDeclared(files: SourceFile[]): DeclaredDeps {
  const d = emptyDeclared();
  for (const f of files) {
    const name = base(f.path);
    try {
      let used = true;
      if (name === "package.json") parsePackageJson(f.content, d, f.path);
      else if (name === "pnpm-lock.yaml") parsePnpmLock(f.content, d);
      else if (name === "package-lock.json" || name === "npm-shrinkwrap.json") parsePackageLock(f.content, d);
      else if (name === "yarn.lock") parseYarnLock(f.content, d);
      else if (/^requirements.*\.txt$/.test(name) || /^constraints.*\.txt$/.test(name)) parseRequirements(f.content, d);
      else if (name === "pyproject.toml") parsePyproject(f.content, d);
      else if (name === "Pipfile") parsePipfile(f.content, d);
      else if (name === "poetry.lock") parsePoetryLock(f.content, d);
      else if (name === "Pipfile.lock") parsePipfileLock(f.content, d);
      else if (name === ".npmrc") parseNpmrc(f.content, d);
      else if (/^tsconfig.*\.json$/.test(name) || name === "jsconfig.json") parseTsconfig(f.content, d);
      else used = false;
      if (used) d.manifests.push(f.path);
    } catch (e) {
      d.warnings.push(`${f.path}: ${(e as Error).message}`);
    }
  }
  return d;
}
