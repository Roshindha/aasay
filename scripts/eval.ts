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
process.exit(result.gate === "pass" ? 0 : 1);
