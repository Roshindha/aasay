import { runReview } from "@/core/pipeline";
import type { Finding, PatchCandidate, ScoreAxes, ScoredPatch, SourceFile } from "@/core/types";
import { diffPaths, runGate, type GateOptions } from "@/gate/gate";
import { importedNames, importStatementRange } from "./generate";

export const WEIGHTS: Record<keyof ScoreAxes, number> = { correctness: 0.4, safety: 0.2, minimality: 0.15, maintainability: 0.15, testability: 0.1 };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const weighted = (a: ScoreAxes) => Object.entries(WEIGHTS).reduce((s, [k, w]) => s + a[k as keyof ScoreAxes] * w, 0);

function diffLines(diff: string) {
  const added: string[] = [], removed: string[] = [];
  for (const l of diff.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) added.push(l.slice(1));
    else if (l.startsWith("-") && !l.startsWith("---")) removed.push(l.slice(1));
  }
  return { added, removed };
}

/** Names imported by removed lines that are still referenced after the patch but no longer imported anywhere in the file. */
function danglingReferences(before: SourceFile[], after: SourceFile[], diff: string): string[] {
  const dangling: string[] = [];
  const importedIn = (content: string, py: boolean): Set<string> => {
    const ls = content.split("\n");
    const set = new Set<string>();
    ls.forEach((line, i) => {
      if (!/\b(import|require)\b/.test(line) || /^\s*(\/\/|#)/.test(line)) return;
      const [s, e] = importStatementRange(ls, i, py);
      for (const n of importedNames(ls.slice(s, e + 1).join("\n"))) set.add(n);
    });
    return set;
  };
  for (const p of diffPaths(diff)) {
    const b = before.find((f) => f.path === p), a = after.find((f) => f.path === p);
    if (!b || !a || !/\.(m|c)?[tj]sx?$|\.py$/.test(p)) continue;
    const py = p.endsWith(".py");
    const was = importedIn(b.content, py), now = importedIn(a.content, py);
    const code = a.content.replace(/^\s*(\/\/|#).*$/gm, "");
    for (const n of was) {
      if (now.has(n) || dangling.includes(n)) continue;
      if (new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(code.split("\n").filter((l) => !/\b(import|require)\b/.test(l)).join("\n"))) dangling.push(n);
    }
  }
  return dangling;
}

export async function scorePatch(finding: Finding, candidate: PatchCandidate, files: SourceFile[], gateOpts?: GateOptions): Promise<ScoredPatch> {
  const gate = await runGate(files, candidate.diff, gateOpts);
  const zero: ScoreAxes = { correctness: 0, minimality: 0, safety: 0, maintainability: 0, testability: 0 };
  if (!gate.eligible) {
    const { patchedFiles: _drop, ...g } = gate; void _drop;
    return { candidate, axes: zero, total: 0, gate: g };
  }
  const { patchedFiles, ...gateResult } = gate;
  const { added, removed } = diffLines(candidate.diff);
  const touched = diffPaths(candidate.diff);

  // correctness: re-run the whole review on the patched tree
  const after = await runReview({ files: patchedFiles, registryMode: "offline" });
  const resolved = !after.findings.some((f) => f.lane === finding.lane && f.file === finding.file && (f.specifier ?? f.title) === (finding.specifier ?? finding.title));
  const before = await runReview({ files, registryMode: "offline" });
  const beforeIds = new Set(before.findings.map((f) => `${f.lane}|${f.file}|${f.specifier ?? f.title}`));
  const introduced = after.findings.filter((f) => !beforeIds.has(`${f.lane}|${f.file}|${f.specifier ?? f.title}`) && f.severity !== "low");
  const dangling = danglingReferences(files, patchedFiles, candidate.diff);
  const correctness = clamp01((resolved ? 1 : 0) - 0.3 * introduced.length - (dangling.length ? 0.45 : 0));

  const changed = added.length + removed.length;
  const minimality = clamp01(1 - changed / 24);

  const addsDependency = touched.some((p) => /package\.json$|requirements.*\.txt$|pyproject\.toml$/.test(p));
  const risky = added.some((l) => /\beval\(|\bexec\(|child_process|subprocess|process\.env|os\.environ|curl |wget /.test(l));
  const outsideTarget = touched.filter((p) => p !== finding.file && !/package\.json$|requirements.*\.txt$/.test(p)).length;
  const safety = clamp01(1 - (risky ? 0.8 : 0) - (addsDependency ? 0.25 : 0) - 0.3 * outsideTarget);

  const commentedOut = added.filter((l) => /^\s*(\/\/|#)/.test(l)).length;
  const todo = added.filter((l) => /TODO/.test(l)).length;
  const aliasing = added.some((l) => /\bimport\b.*\bas\b/.test(l)) ? 0.15 : 0;
  const maintainability = clamp01(1 - 0.15 * commentedOut - 0.25 * todo - aliasing - (dangling.length ? 0.2 : 0));

  const touchesTest = touched.some((p) => /(\.test\.|\.spec\.|(^|\/)test_)/.test(p));
  const hasTestsNearby = files.some((f) => /(\.test\.|\.spec\.|(^|\/)test_)/.test(f.path));
  const weakensTests = touchesTest && removed.some((l) => /\b(expect|assert)\b/.test(l)) && !added.some((l) => /\b(expect|assert)\b/.test(l));
  const testability = clamp01((hasTestsNearby ? 0.9 : 0.7) - (weakensTests ? 0.4 : 0) - (added.some((l) => /TODO/.test(l)) ? 0.2 : 0));

  const axes: ScoreAxes = { correctness, minimality, safety, maintainability, testability };
  return { candidate, axes, total: Number(weighted(axes).toFixed(4)), gate: gateResult };
}
