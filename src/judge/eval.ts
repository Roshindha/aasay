import fs from "node:fs";
import path from "node:path";
import { loadDir } from "@/core/files";
import { runReview } from "@/core/pipeline";
import { AnswerKeySchema, type AnswerKey, type EvalResult, type Finding } from "@/core/types";
import { fixturesDir } from "@/deps/popular";

export const GATE = { minRecall: 0.8, minPrecision: 0.8, criticalRecall: 1 } as const;

export function loadAnswerKey(dir = fixturesDir()): AnswerKey {
  return AnswerKeySchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "answer-key.json"), "utf8")));
}

export function scoreAgainstKey(findings: Finding[], key: AnswerKey): EvalResult {
  const matchedFinding = new Set<string>();
  const found: string[] = [], missed: string[] = [];
  for (const bug of key.bugs) {
    const hits = findings.filter((f) => f.file === bug.file && f.lanes.includes(bug.lane) && Math.abs(f.line - bug.line) <= key.lineTolerance);
    if (hits.length) { found.push(bug.id); hits.forEach((h) => matchedFinding.add(h.id)); } else missed.push(bug.id);
  }
  const fp = findings.filter((f) => !matchedFinding.has(f.id));
  const crit = key.bugs.filter((b) => b.critical);
  const critFound = crit.filter((b) => found.includes(b.id)).length;
  const recall = key.bugs.length ? found.length / key.bugs.length : 1;
  const precision = findings.length ? matchedFinding.size / findings.length : 1;
  const criticalRecall = crit.length ? critFound / crit.length : 1;
  const gateReasons: string[] = [];
  if (recall < GATE.minRecall) gateReasons.push(`recall ${recall.toFixed(2)} < ${GATE.minRecall}`);
  if (precision < GATE.minPrecision) gateReasons.push(`precision ${precision.toFixed(2)} < ${GATE.minPrecision}`);
  if (criticalRecall < GATE.criticalRecall) gateReasons.push(`critical recall ${criticalRecall.toFixed(2)} < ${GATE.criticalRecall}`);
  return {
    mode: "seeded", recall, precision, criticalRecall,
    gate: gateReasons.length ? "fail" : "pass", gateReasons, found, missed,
    falsePositives: fp.map((f) => `${f.file}:${f.line} ${f.title}`), totalBugs: key.bugs.length, totalFindings: findings.length,
  };
}

/** Seeded run: reviews fixtures/seeded-demo offline and scores it against fixtures/answer-key.json. Never mixed with live results. */
export async function runSeededEval(dir = fixturesDir()) {
  const files = loadDir(path.join(dir, "seeded-demo"));
  const review = await runReview({ files, registryMode: "offline" });
  return { review, result: scoreAgainstKey(review.findings, loadAnswerKey(dir)), files };
}
