import type { Finding, Label, Severity } from "@/core/types";

const SEV_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const LABEL_RANK: Record<Label, number> = { confirmed: 2, likely: 1, speculative: 0 };

const maxBy = <T,>(a: T, b: T, rank: Record<string, number>) => ((rank[a as string] ?? 0) >= (rank[b as string] ?? 0) ? a : b);

/**
 * Merge findings that point at the same place for the same reason, then label them.
 * Dedupe key: same file + line + (specifier when present, else normalized title).
 * Rules: highest severity wins; highest label wins; two or more distinct lanes agreeing upgrades
 * "likely" to "confirmed"; an LLM-only (speculative) finding is never upgraded by itself.
 */
export function judge(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.file}|${f.line}|${f.specifier ?? f.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(f);
  }
  const merged: Finding[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || LABEL_RANK[b.label] - LABEL_RANK[a.label]);
    const base = { ...sorted[0]! };
    for (const g of sorted.slice(1)) {
      base.severity = maxBy(base.severity, g.severity, SEV_RANK);
      base.label = maxBy(base.label, g.label, LABEL_RANK);
      base.evidence = [...new Set([...base.evidence, ...g.evidence])];
      base.lanes = [...new Set([...base.lanes, ...g.lanes, g.lane])];
      base.specifier ??= g.specifier; base.registry ??= g.registry; base.registryStatus ??= g.registryStatus; base.typosquatOf ??= g.typosquatOf;
    }
    base.lanes = [...new Set([...base.lanes, base.lane])];
    if (base.label === "likely" && base.lanes.length >= 2) base.label = "confirmed";
    merged.push(base);
  }
  return merged.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || LABEL_RANK[b.label] - LABEL_RANK[a.label] || a.file.localeCompare(b.file) || a.line - b.line);
}
