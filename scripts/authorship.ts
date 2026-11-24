/**
 * Authorship & disclosure audit for a local repository (read-only).
 *   pnpm authorship [path] [--draft] [--json]
 * Reports signals with strength and evidence; never a verdict about who wrote the code.
 */
import { scanLocal } from "@/core/service";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--")) ?? ".";
const scan = await scanLocal(target, { offline: true });
const { authorship: r, disclosure } = scan.review;

if (args.includes("--json")) {
  console.log(JSON.stringify({ report: r, disclosure }, null, 2));
} else {
  console.log(`Authorship audit: ${scan.label}`);
  console.log(`  disclosure status: ${r.status}    overall: ${r.overall}`);
  console.log(`  ${r.summary}`);
  console.log(`  signals: ${r.counts.strong} strong, ${r.counts.moderate} moderate, ${r.counts.speculative} speculative`);
  console.log(`  looked at: ${r.coverage.paths} tracked paths, ${r.coverage.commits} commits${r.coverage.commitStats ? "" : " (no line stats)"}, docs: ${r.coverage.docsRead.join(", ") || "none"}`);
  for (const s of r.signals) {
    console.log(`\n  [${s.strength}] ${s.title}`);
    for (const e of s.evidence) console.log(`      ${e}`);
    if (s.caveat) console.log(`      caveat: ${s.caveat}`);
  }
  console.log("\n  " + r.caveats.join("\n  "));
  if (args.includes("--draft")) console.log("\n" + disclosure.markdown);
}
