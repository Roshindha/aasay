import type { Label, Registry, RegistryStatus, SourceFile } from "@/core/types";
import { collectDeclared, type DeclaredDeps } from "./manifests";
import { normalizePyName } from "./names";
import { isNodeBuiltin } from "./node-builtins";
import { parseImports, type ParsedImport } from "./parser";
import { loadPopular } from "./popular";
import { PY_STDLIB } from "./python-stdlib";
import type { RegistryClient } from "./registry";
import { findTyposquat } from "./typosquat";

export type ImportClass =
  | "relative" | "builtin" | "alias" | "local" | "self"
  | "declared" | "transitive-only" | "undeclared";

export interface ClassifiedImport extends ParsedImport {
  file: string;
  registry: Registry | null;
  cls: ImportClass;
}

export interface DepIssue {
  file: string;
  line: number;
  specifier: string;
  packageName: string;
  registry: Registry;
  kind: "phantom" | "typosquat" | "transitive-only";
  registryStatus: RegistryStatus;
  label: Label;
  typosquatOf?: string;
  note: string;
}

export interface DepReport {
  imports: ClassifiedImport[];
  issues: DepIssue[];
  declared: DeclaredDeps;
  registryKeysConsulted: string[];
  popularSnapshot: { npm: string; pypi: string };
}

/** Every module/package name defined in the repo (file stems and directory names), so sibling and src-layout imports count as local. */
function localPythonModules(files: SourceFile[]): Set<string> {
  const s = new Set<string>();
  for (const f of files) {
    if (!f.path.endsWith(".py")) continue;
    for (const seg of f.path.split("/")) s.add(seg.replace(/\.py$/, "").toLowerCase());
  }
  return s;
}

function localJsRoots(files: SourceFile[], baseUrls: string[]): Set<string> {
  const s = new Set<string>();
  for (const b of baseUrls) {
    const prefix = b ? b.replace(/\/$/, "") + "/" : "";
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      const first = f.path.slice(prefix.length).split("/")[0];
      if (first) s.add(first.replace(/\.(m|c)?(t|j)sx?$/, ""));
    }
  }
  return s;
}

export function classifyImports(files: SourceFile[], declared: DeclaredDeps): ClassifiedImport[] {
  const pyLocal = localPythonModules(files);
  const jsLocal = localJsRoots(files, declared.baseUrls);
  const out: ClassifiedImport[] = [];
  for (const f of files) {
    for (const imp of parseImports(f.path, f.content)) {
      const base = { ...imp, file: f.path };
      if (imp.language === "js") {
        const spec = imp.specifier;
        let cls: ImportClass;
        if (spec.startsWith(".") || spec.startsWith("/") || /^[a-z]+:\/\//i.test(spec)) cls = "relative";
        else if (spec.startsWith("#")) cls = "alias";
        else if (isNodeBuiltin(spec)) cls = "builtin";
        else if (declared.aliasPrefixes.some((p) => spec.startsWith(p))) cls = "alias";
        else if (imp.packageName && declared.selfNames.has(imp.packageName)) cls = "self";
        else if (imp.packageName && jsLocal.has(imp.packageName.split("/")[0]!)) cls = "local";
        else if (imp.packageName && declared.npmDirect.has(imp.packageName)) cls = "declared";
        else if (imp.packageName && declared.npmLockOnly.has(imp.packageName)) cls = "transitive-only";
        else cls = "undeclared";
        out.push({ ...base, registry: "npm", cls });
      } else {
        const top = imp.pyTopLevel!;
        const dist = normalizePyName(imp.packageName ?? top);
        let cls: ImportClass;
        if (PY_STDLIB.has(top)) cls = "builtin";
        else if (pyLocal.has(top.toLowerCase())) cls = "local";
        else if (declared.pyDirect.has(dist) || declared.pyDirect.has(normalizePyName(top))) cls = "declared";
        else if (declared.pyLockOnly.has(dist) || declared.pyLockOnly.has(normalizePyName(top))) cls = "transitive-only";
        else cls = "undeclared";
        out.push({ ...base, registry: "pypi", cls });
      }
    }
  }
  return out;
}

/**
 * Label rules: registry 404 => confirmed phantom, EXCEPT scoped packages or
 * projects with a custom registry => likely. Registry unknown (offline miss / error) => likely at most.
 */
export function phantomLabel(registry: Registry, name: string, status: RegistryStatus, d: DeclaredDeps): Label {
  if (status === "not-found") {
    const scoped = registry === "npm" && name.startsWith("@");
    const custom = registry === "npm" ? d.customRegistry.npm || (scoped && d.customRegistry.npmScopes.has(name.split("/")[0]!)) : d.customRegistry.pypi;
    return scoped || custom ? "likely" : "confirmed";
  }
  if (status === "exists") return "likely";
  return "speculative";
}

export async function analyzeDependencies(files: SourceFile[], client: RegistryClient): Promise<DepReport> {
  const declared = collectDeclared(files);
  const imports = classifyImports(files, declared);
  const issues: DepIssue[] = [];
  const popular = { npm: loadPopular("npm"), pypi: loadPopular("pypi") };
  const popNames = {
    npm: new Set(popular.npm.names.map((n) => n.toLowerCase())),
    pypi: new Set(popular.pypi.names.map((n) => normalizePyName(n))),
  };

  for (const imp of imports) {
    if (!imp.registry || !imp.packageName) continue;
    const reg = imp.registry;
    if (imp.cls === "undeclared" || imp.cls === "transitive-only" || imp.cls === "declared") {
      const name = reg === "pypi" ? normalizePyName(imp.packageName) : imp.packageName;
      const lookup = imp.cls === "declared" ? null : await client.check(reg, imp.packageName);

      // typosquat check applies to every third-party name not itself popular
      const ts = findTyposquat(name, reg === "pypi" ? popular.pypi.names.map(normalizePyName) : popular.npm.names);
      if (ts && !popNames[reg].has(name.toLowerCase())) {
        const status = lookup?.status ?? (await client.check(reg, imp.packageName)).status;
        issues.push({
          file: imp.file, line: imp.line, specifier: imp.specifier, packageName: imp.packageName, registry: reg,
          kind: "typosquat", registryStatus: status, typosquatOf: ts.target,
          label: status === "not-found" ? phantomLabel(reg, name, status, declared) : "likely",
          note: `"${imp.packageName}" is ${ts.distance} edit(s) from popular package "${ts.target}"` +
            (status === "not-found" ? " and does not exist on the registry" : ""),
        });
        if (imp.cls === "undeclared" && status === "not-found") continue; // reported as typosquat already
      }
      if (imp.cls === "undeclared" && lookup) {
        issues.push({
          file: imp.file, line: imp.line, specifier: imp.specifier, packageName: imp.packageName, registry: reg,
          kind: "phantom", registryStatus: lookup.status, label: phantomLabel(reg, name, lookup.status, declared),
          note: lookup.status === "not-found"
            ? `"${imp.packageName}" is imported but not declared, and the ${reg} registry has no such package`
            : lookup.status === "exists"
              ? `"${imp.packageName}" is imported but not declared in any manifest`
              : `"${imp.packageName}" is imported but not declared; registry status could not be determined (${lookup.source})`,
        });
      } else if (imp.cls === "transitive-only") {
        issues.push({
          file: imp.file, line: imp.line, specifier: imp.specifier, packageName: imp.packageName, registry: reg,
          kind: "transitive-only", registryStatus: "exists", label: "likely",
          note: `"${imp.packageName}" is only present transitively in a lockfile, not declared directly`,
        });
      }
    }
  }
  return {
    imports, issues, declared,
    registryKeysConsulted: [...client.consulted],
    popularSnapshot: { npm: popular.npm.generatedAt, pypi: popular.pypi.generatedAt },
  };
}
