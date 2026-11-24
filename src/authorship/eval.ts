import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fixturesDir } from "@/deps/popular";
import { buildReport } from "./status";
import { CommitInfoSchema, type AuthorshipInput, type AuthorshipReport } from "./types";

export const AuthorshipCaseSchema = z.object({
  id: z.string(), description: z.string(), humanWritten: z.boolean(),
  paths: z.array(z.string()), files: z.array(z.object({ path: z.string(), content: z.string() })), commits: z.array(CommitInfoSchema),
});
export type AuthorshipCase = z.infer<typeof AuthorshipCaseSchema>;

export const AuthorshipKeySchema = z.object({
  note: z.string(),
  cases: z.array(z.object({
    id: z.string(), humanWritten: z.boolean(), expectedStatus: z.string(), expectedOverall: z.string(), note: z.string(),
    /** strong and moderate signal refs that must be reported, and no others */
    expectedSignals: z.array(z.string()),
    /** speculative refs that should appear (to prove the false-positive style signals really fire, and stay weak) */
    expectedSpeculative: z.array(z.string()),
  })),
});
export type AuthorshipKey = z.infer<typeof AuthorshipKeySchema>;

const dir = (d = fixturesDir()) => path.join(d, "authorship");

export function listAuthorshipCases(d = fixturesDir()): AuthorshipCase[] {
  return fs.readdirSync(dir(d)).filter((f) => f.endsWith(".json") && f !== "answer-key.json").sort()
    .map((f) => AuthorshipCaseSchema.parse(JSON.parse(fs.readFileSync(path.join(dir(d), f), "utf8"))));
}
export const loadAuthorshipKey = (d = fixturesDir()): AuthorshipKey => AuthorshipKeySchema.parse(JSON.parse(fs.readFileSync(path.join(dir(d), "answer-key.json"), "utf8")));
export const caseInput = (c: AuthorshipCase): AuthorshipInput => ({ paths: c.paths, files: c.files, commits: c.commits });
export const reportForCase = (c: AuthorshipCase): AuthorshipReport => buildReport(caseInput(c));

export interface CaseResult {
  id: string; humanWritten: boolean; status: string; expectedStatus: string; statusOk: boolean; overall: string; overallOk: boolean;
  matched: string[]; missed: string[]; unexpected: string[]; speculative: string[]; speculativeMissing: string[];
  /** human-written fixture that produced a strong/moderate AI-evidence signal or a non-"none-found" status */
  falsePositive: boolean;
}
export interface AuthorshipEval {
  precision: number; recall: number; statusAccuracy: number; overallAccuracy: number;
  falsePositiveRate: number; humanFixtures: number; falsePositives: string[];
  speculativeOnHumanFixtures: number;
  strongModerateExpected: number; strongModerateReported: number;
  gate: "pass" | "fail"; gateReasons: string[]; cases: CaseResult[];
}

export const AUTHORSHIP_GATE = { minPrecision: 0.9, minRecall: 0.9, maxFalsePositiveRate: 0, minStatusAccuracy: 1 } as const;

export function evaluateAuthorship(d = fixturesDir()): AuthorshipEval {
  const key = loadAuthorshipKey(d);
  const cases = listAuthorshipCases(d);
  const results: CaseResult[] = [];
  let matched = 0, reported = 0, expected = 0;
  for (const k of key.cases) {
    const c = cases.find((x) => x.id === k.id);
    if (!c) throw new Error(`fixture missing for ${k.id}`);
    const r = reportForCase(c);
    const sm = r.signals.filter((s) => s.strength !== "speculative").map((s) => s.ref);
    const spec = r.signals.filter((s) => s.strength === "speculative").map((s) => s.ref);
    const m = sm.filter((x) => k.expectedSignals.includes(x));
    reported += sm.length; expected += k.expectedSignals.length; matched += m.length;
    // a human-written fixture is falsely accused only by AI *evidence*; an unverifiable "hand-written" claim is not evidence
    const aiEvidence = r.signals.some((s) => s.strength !== "speculative" && s.claim !== "human-only");
    results.push({
      id: k.id, humanWritten: k.humanWritten, status: r.status, expectedStatus: k.expectedStatus, statusOk: r.status === k.expectedStatus,
      overall: r.overall, overallOk: r.overall === k.expectedOverall,
      matched: m, missed: k.expectedSignals.filter((x) => !sm.includes(x)), unexpected: sm.filter((x) => !k.expectedSignals.includes(x)),
      speculative: spec, speculativeMissing: k.expectedSpeculative.filter((x) => !spec.includes(x)),
      falsePositive: k.humanWritten && (aiEvidence || r.status !== "none-found"),
    });
  }
  const human = results.filter((r) => r.humanWritten);
  const precision = reported ? matched / reported : 1;
  const recall = expected ? matched / expected : 1;
  const statusAccuracy = results.filter((r) => r.statusOk).length / results.length;
  const falsePositiveRate = human.length ? human.filter((r) => r.falsePositive).length / human.length : 0;
  const reasons: string[] = [];
  const specMissing = results.filter((r) => r.speculativeMissing.length).map((r) => `${r.id}: ${r.speculativeMissing.join(",")}`);
  if (specMissing.length) reasons.push(`expected speculative signals did not fire (${specMissing.join("; ")})`);
  if (precision < AUTHORSHIP_GATE.minPrecision) reasons.push(`precision ${precision.toFixed(2)} < ${AUTHORSHIP_GATE.minPrecision}`);
  if (recall < AUTHORSHIP_GATE.minRecall) reasons.push(`recall ${recall.toFixed(2)} < ${AUTHORSHIP_GATE.minRecall}`);
  if (falsePositiveRate > AUTHORSHIP_GATE.maxFalsePositiveRate) reasons.push(`false-positive rate ${falsePositiveRate.toFixed(2)} > ${AUTHORSHIP_GATE.maxFalsePositiveRate}`);
  if (statusAccuracy < AUTHORSHIP_GATE.minStatusAccuracy) reasons.push(`status accuracy ${statusAccuracy.toFixed(2)} < ${AUTHORSHIP_GATE.minStatusAccuracy}`);
  return {
    precision, recall, statusAccuracy, overallAccuracy: results.filter((r) => r.overallOk).length / results.length,
    falsePositiveRate, humanFixtures: human.length, falsePositives: human.filter((r) => r.falsePositive).map((r) => r.id),
    speculativeOnHumanFixtures: human.reduce((n, r) => n + r.speculative.length, 0),
    strongModerateExpected: expected, strongModerateReported: reported,
    gate: reasons.length ? "fail" : "pass", gateReasons: reasons, cases: results,
  };
}
