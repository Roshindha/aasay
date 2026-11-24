import { evaluateAuthorship } from "@/authorship/eval";
import { runSeededEval } from "@/judge/eval";

const { result, review } = await runSeededEval();
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
console.log("Assay seeded eval (self-authored benchmark; measures plumbing, not real-world accuracy)");
console.log(`  recall:          ${pct(result.recall)}  (${result.found.length}/${result.totalBugs})`);
console.log(`  precision:       ${pct(result.precision)}  (${result.totalFindings - result.falsePositives.length}/${result.totalFindings} findings match a planted bug)`);
console.log(`  critical recall: ${pct(result.criticalRecall)}`);
console.log(`  gate:            ${result.gate.toUpperCase()}${result.gateReasons.length ? " - " + result.gateReasons.join("; ") : ""}`);
console.log(`  found:   ${result.found.join(", ")}`);
console.log(`  missed:  ${result.missed.join(", ") || "-"}`);
const phantom = review.findings.filter((f) => f.lane === "phantom-dependency");
console.log("Phantom dependencies:");
for (const f of phantom) console.log(`  [${f.label}] ${f.file}:${f.line} ${f.specifier} (${f.registry}: ${f.registryStatus})`);
if (result.falsePositives.length) { console.log("False positives:"); for (const f of result.falsePositives) console.log("  " + f); }

const au = evaluateAuthorship();
console.log("\nAuthorship audit eval (self-authored fixtures in fixtures/authorship; signals, not verdicts)");
console.log(`  strong+moderate signals: precision ${pct(au.precision)} (${au.strongModerateReported} reported), recall ${pct(au.recall)} (${au.strongModerateExpected} expected)`);
console.log(`  status accuracy: ${pct(au.statusAccuracy)}   overall-result accuracy: ${pct(au.overallAccuracy)}`);
console.log(`  FPR on human-written fixtures: ${pct(au.falsePositiveRate)} (${au.falsePositives.length}/${au.humanFixtures}); speculative style/history signals on them: ${au.speculativeOnHumanFixtures} (expected, weak, never change the result)`);
console.log(`  gate:            ${au.gate.toUpperCase()}${au.gateReasons.length ? " - " + au.gateReasons.join("; ") : ""}`);
for (const c of au.cases) console.log(`    ${c.statusOk && c.overallOk ? "ok " : "BAD"} ${c.id.padEnd(30)} status=${c.status} overall=${c.overall}${c.missed.length ? " missed=" + c.missed.join(",") : ""}${c.unexpected.length ? " unexpected=" + c.unexpected.join(",") : ""}`);
process.exit(result.gate === "pass" && au.gate === "pass" ? 0 : 1);
