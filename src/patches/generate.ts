import crypto from "node:crypto";
import { createTwoFilesPatch } from "diff";
import type { Finding, PatchCandidate, PatchStrategy, SourceFile } from "@/core/types";
import { API_REPLACEMENTS, PACKAGE_REPLACEMENTS } from "./replacements";

export function makeDiff(filePath: string, before: string, after: string): string {
  if (before === after) return "";
  const raw = createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, before, after, "", "", { context: 3 });
  return raw.split("\n").filter((l) => !l.startsWith("Index: ") && !/^={10,}$/.test(l)).join("\n");
}

type Changes = Record<string, string>; // path -> new content

function candidate(f: Finding, files: SourceFile[], strategy: PatchStrategy, summary: string, changes: Changes): PatchCandidate | null {
  const diff = Object.entries(changes).map(([p, after]) => makeDiff(p, files.find((x) => x.path === p)?.content ?? "", after)).filter(Boolean).join("");
  if (!diff) return null;
  return { id: `${f.id}:${strategy}:${crypto.createHash("sha1").update(diff).digest("hex").slice(0, 6)}`, findingId: f.id, strategy, summary, diff };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Line range [start, end] (0-based, inclusive) of the import/require statement that mentions `spec` near `idx`. */
export function importStatementRange(lines: string[], idx: number, python: boolean): [number, number] {
  let start = idx, end = idx;
  if (python) {
    if (/^\s*from\b.*\bimport\s*\(\s*$/.test(lines[idx] ?? "")) { while (end < lines.length - 1 && !/\)/.test(lines[end]!)) end++; }
    return [start, end];
  }
  while (start > 0 && idx - start < 30 && !/\b(import|require|export)\b/.test(lines[start]!)) start--;
  while (end < lines.length - 1 && end - idx < 30 && !/["'`]\s*\)?\s*;?\s*$/.test(lines[end]!)) end++;
  return [start, end];
}

export function importedNames(stmt: string): string[] {
  const names: string[] = [];
  let m = /\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(stmt); // default
  if (m) names.push(m[1]!);
  m = /\{([^}]*)\}/.exec(stmt);
  if (m) for (const p of m[1]!.split(",")) { const a = p.trim().replace(/^type\s+/, "").split(/\s+as\s+/); const n = (a[1] ?? a[0])!.trim(); if (n) names.push(n); }
  m = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(stmt); if (m) names.push(m[1]!);
  m = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require/.exec(stmt); if (m) names.push(m[1]!);
  m = /\bimport\s+([A-Za-z_][\w.]*)(?:\s+as\s+(\w+))?\s*$/.exec(stmt); if (m && /^\s*import\s/.test(stmt) && !/\bfrom\b/.test(stmt)) names.push(m[2] ?? m[1]!.split(".")[0]!); // python `import x`
  m = /^\s*from\s+\S+\s+import\s+\(?([^)]*)\)?/.exec(stmt);
  if (m && !/\bfrom\s*["']/.test(stmt)) for (const p of m[1]!.split(",")) { const a = p.trim().split(/\s+as\s+/); const n = (a[1] ?? a[0])!.trim(); if (n && n !== "*") names.push(n); }
  return [...new Set(names)];
}

function nearestManifest(files: SourceFile[], from: string, names: RegExp): SourceFile | null {
  const parts = from.split("/").slice(0, -1);
  for (let n = parts.length; n >= 0; n--) {
    const dir = parts.slice(0, n).join("/");
    const hit = files.find((f) => (dir ? f.path.startsWith(dir + "/") : true) && f.path.split("/").slice(0, -1).join("/") === dir && names.test(f.path.split("/").pop()!));
    if (hit) return hit;
  }
  return null;
}

function addToManifest(m: SourceFile, pkg: string, registry: "npm" | "pypi", dev: boolean): string | null {
  if (registry === "npm") {
    try {
      const j = JSON.parse(m.content) as Record<string, Record<string, string>>;
      const key = dev ? "devDependencies" : "dependencies";
      j[key] = { ...(j[key] ?? {}), [pkg]: "latest" };
      const sorted = Object.fromEntries(Object.entries(j[key]!).sort(([a], [b]) => a.localeCompare(b)));
      j[key] = sorted;
      return JSON.stringify(j, null, 2) + "\n";
    } catch { return null; }
  }
  return m.content.replace(/\n*$/, "\n") + `${pkg}\n`;
}

function phantomCandidates(f: Finding, files: SourceFile[]): PatchCandidate[] {
  const file = files.find((x) => x.path === f.file); if (!file || !f.specifier || !f.registry) return [];
  const python = f.registry === "pypi";
  const lines = file.content.split("\n");
  const [s, e] = importStatementRange(lines, f.line - 1, python);
  const stmt = lines.slice(s, e + 1).join("\n");
  if (!stmt.includes(f.specifier)) return [];
  const pkg = python ? f.specifier.split(".")[0]! : f.specifier;
  const out: Array<PatchCandidate | null> = [];
  const without = [...lines.slice(0, s), ...lines.slice(e + 1)].join("\n");
  const cm = python ? "#" : "//";
  const commented = [...lines.slice(0, s), `${cm} ASSAY: removed phantom dependency "${pkg}" (not found on ${f.registry}); restore a real implementation`, ...lines.slice(s, e + 1).map((l) => `${cm} ${l}`), ...lines.slice(e + 1)].join("\n");
  const replacement = f.typosquatOf ?? PACKAGE_REPLACEMENTS[f.registry][pkg];
  const manifest = nearestManifest(files, f.file, python ? /^requirements.*\.txt$/ : /^package\.json$/);
  const isTest = /(\.test\.|\.spec\.|(^|\/)test_)/.test(f.file);

  if (f.registryStatus === "not-found" || f.typosquatOf) {
    out.push(candidate(f, files, "conservative", `Remove the import of "${pkg}"`, { [f.file]: without }));
    if (replacement) {
      const swapped = lines.map((l, i) => (i >= s && i <= e ? l.replace(new RegExp(`(["'])${escapeRe(f.specifier!)}\\1`), `$1${replacement}$1`).replace(new RegExp(`^(\\s*(?:from|import)\\s+)${escapeRe(f.specifier!)}\\b`), `$1${replacement}`) : l)).join("\n");
      out.push(candidate(f, files, "idiomatic", `Replace "${pkg}" with "${replacement}"`, { [f.file]: swapped }));
      const man = manifest && addToManifest(manifest, replacement, f.registry, isTest);
      if (manifest && man) out.push(candidate(f, files, "robust", `Replace "${pkg}" with "${replacement}" and declare it in ${manifest.path}`, { [f.file]: swapped, [manifest.path]: man }));
    } else {
      out.push(candidate(f, files, "robust", `Comment out the import of "${pkg}" with a restore note`, { [f.file]: commented }));
    }
  } else if (f.registryStatus === "exists" && f.registry) {
    const man = manifest && addToManifest(manifest, pkg, f.registry, isTest);
    if (manifest && man) {
      out.push(candidate(f, files, "conservative", `Declare "${pkg}" in ${manifest.path}`, { [manifest.path]: man }));
      out.push(candidate(f, files, "robust", `Remove the import of "${pkg}" instead of adding a dependency`, { [f.file]: without }));
    }
  }
  return out.filter((x): x is PatchCandidate => !!x);
}

function hallucinationCandidates(f: Finding, files: SourceFile[]): PatchCandidate[] {
  const file = files.find((x) => x.path === f.file); if (!file) return [];
  const out: Array<PatchCandidate | null> = [];
  const lines = file.content.split("\n");
  const api = /^`([\w.]+)` does not exist$/.exec(f.title)?.[1];
  if (api && API_REPLACEMENTS[api]) {
    const to = API_REPLACEMENTS[api];
    const one = lines.map((l, i) => (i === f.line - 1 ? l.replace(api, to) : l)).join("\n");
    out.push(candidate(f, files, "conservative", `Replace ${api} with ${to} on this line`, { [f.file]: one }));
    out.push(candidate(f, files, "idiomatic", `Replace every ${api} with ${to}`, { [f.file]: file.content.split(api).join(to) }));
  }
  const miss = /^`(\w+)` is not exported by `(.+)`$/.exec(f.title);
  const near = /Did you mean `(\w+)`\?/.exec(f.detail)?.[1];
  if (miss && near) {
    const [, bad] = miss;
    const alias = lines.map((l, i) => (i === f.line - 1 ? l.replace(new RegExp(`\\b${bad}\\b`), `${near} as ${bad}`) : l)).join("\n");
    out.push(candidate(f, files, "conservative", `Import ${near} as ${bad} (one-line change)`, { [f.file]: alias }));
    out.push(candidate(f, files, "idiomatic", `Rename ${bad} to ${near} throughout the file`, { [f.file]: file.content.replace(new RegExp(`\\b${bad}\\b`, "g"), near) }));
  }
  return out.filter((x): x is PatchCandidate => !!x);
}

function driftCandidates(f: Finding, files: SourceFile[]): PatchCandidate[] {
  const file = files.find((x) => x.path === f.file); if (!file) return [];
  const m = /^`(\w+)` is (.+) but the spec says (.+)$/.exec(f.title);
  if (!m) return [];
  const lines = file.content.split("\n");
  const fixed = lines.map((l, i) => (i === f.line - 1 ? l.replace(m[2]!, m[3]!) : l)).join("\n");
  const c = candidate(f, files, "conservative", `Set ${m[1]} to ${m[3]} as the spec requires`, { [f.file]: fixed });
  return c ? [c] : [];
}

function theaterCandidates(f: Finding, files: SourceFile[]): PatchCandidate[] {
  const file = files.find((x) => x.path === f.file); if (!file || !f.title.startsWith("Tautological")) return [];
  const lines = file.content.split("\n");
  const py = file.path.endsWith(".py");
  const indent = /^\s*/.exec(lines[f.line - 1] ?? "")![0];
  const removed = lines.filter((_, i) => i !== f.line - 1);
  const todo = lines.map((l, i) => (i === f.line - 1 ? `${indent}${py ? 'raise NotImplementedError("TODO: assert real behaviour")' : 'throw new Error("TODO: assert real behaviour");'}` : l)).join("\n");
  return [
    candidate(f, files, "conservative", "Delete the tautological assertion", { [f.file]: removed.join("\n") }),
    candidate(f, files, "robust", "Replace it with an explicit failing TODO so the gap is visible", { [f.file]: todo }),
  ].filter((x): x is PatchCandidate => !!x);
}

export function generateCandidates(f: Finding, files: SourceFile[]): PatchCandidate[] {
  const all =
    f.lane === "authorship" ? [] // never auto-patched: signals are disclosed, not edited away
    : f.lane === "phantom-dependency" ? phantomCandidates(f, files)
    : f.lane === "hallucination" ? hallucinationCandidates(f, files)
    : f.lane === "spec-drift" ? driftCandidates(f, files)
    : theaterCandidates(f, files);
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.diff) ? false : (seen.add(c.diff), true)));
}
