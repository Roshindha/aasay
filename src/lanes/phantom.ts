import type { Finding, Severity } from "@/core/types";
import type { DepIssue } from "@/deps/resolver";
import { makeFinding, type Lane } from "./common";

function severity(i: DepIssue): Severity {
  if (i.kind === "transitive-only") return "low";
  if (i.kind === "typosquat") return i.registryStatus === "not-found" ? "critical" : "high";
  if (i.registryStatus === "not-found") return "critical";
  if (i.registryStatus === "exists") return "medium";
  return "low";
}

export function issueToFinding(i: DepIssue, manifests: string[]): Finding {
  const title =
    i.kind === "typosquat" ? `Possible typosquat: \`${i.packageName}\` (looks like \`${i.typosquatOf}\`)`
    : i.kind === "transitive-only" ? `\`${i.packageName}\` used but only a transitive dependency`
    : i.registryStatus === "not-found" ? `Phantom dependency: \`${i.packageName}\` does not exist on ${i.registry}`
    : `Undeclared dependency: \`${i.packageName}\``;
  const f = makeFinding({
    lane: "phantom-dependency", severity: severity(i), label: i.label, file: i.file, line: i.line, title, detail: i.note,
    evidence: [`registry ${i.registry}: ${i.registryStatus}`, `manifests checked: ${manifests.join(", ") || "(none found)"}`],
  });
  return { ...f, specifier: i.specifier, registry: i.registry, registryStatus: i.registryStatus, typosquatOf: i.typosquatOf };
}

export const phantomLane: Lane = ({ deps }) => {
  if (!deps) return [];
  return deps.issues.map((i) => issueToFinding(i, deps.declared.manifests));
};
