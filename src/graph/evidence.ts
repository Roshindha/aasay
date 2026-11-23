import type { EvidenceGraph, Finding } from "@/core/types";
import type { DepReport } from "@/deps/resolver";

/** Findings, the files they live in, the dependencies they involve, and the manifests that do or don't declare them. */
export function buildEvidenceGraph(findings: Finding[], deps?: DepReport): EvidenceGraph {
  const nodes = new Map<string, EvidenceGraph["nodes"][number]>();
  const edges: EvidenceGraph["edges"] = [];
  const edgeKeys = new Set<string>();
  const addNode = (id: string, kind: EvidenceGraph["nodes"][number]["kind"], label: string) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label }); };
  const addEdge = (from: string, to: string, kind: EvidenceGraph["edges"][number]["kind"]) => {
    const k = `${from}>${to}>${kind}`; if (!edgeKeys.has(k)) { edgeKeys.add(k); edges.push({ from, to, kind }); }
  };

  for (const f of findings) {
    addNode(f.id, "finding", `${f.title} [${f.label}]`);
    addNode(`file:${f.file}`, "file", f.file);
    addEdge(f.id, `file:${f.file}`, "located-in");
    if (f.lanes.length > 1) for (const l of f.lanes) addNode(`lane:${l}`, "finding", `lane ${l}`), addEdge(f.id, `lane:${l}`, "duplicates");
    if (f.lane === "phantom-dependency" && f.specifier && deps) {
      const imp = deps.imports.find((i) => i.file === f.file && i.line === f.line && i.specifier === f.specifier);
      const pkg = imp?.packageName ?? f.specifier;
      const reg = f.registry ?? imp?.registry ?? "npm";
      const depId = `dep:${reg}:${pkg}`;
      addNode(depId, "dependency", `${pkg} (${reg}: ${f.registryStatus ?? "?"})`);
      addEdge(`file:${f.file}`, depId, "imports");
      addEdge(f.id, depId, "located-in");
      const wanted = reg === "npm" ? /package\.json$|package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$/ : /requirements.*\.txt$|pyproject\.toml$|Pipfile(\.lock)?$|poetry\.lock$/;
      const mans = deps.declared.manifests.filter((m) => wanted.test(m));
      for (const m of mans) { addNode(`manifest:${m}`, "manifest", m); addEdge(depId, `manifest:${m}`, "missing-from"); }
    }
  }
  return { nodes: [...nodes.values()], edges };
}
