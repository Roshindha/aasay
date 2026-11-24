import type { Finding } from "@/core/types";
import type { TournamentResult } from "./tournament";

/** A self-contained brief another agent or human can act on. */
export function buildHandoff(t: TournamentResult): string {
  const f: Finding = t.finding;
  const lines: string[] = [
    `# Fix handoff: ${f.title}`,
    ``,
    `- Lane: ${f.lane} | Severity: ${f.severity} | Confidence: ${f.label}`,
    `- Location: ${f.file}:${f.line}`,
    ...(f.specifier ? [`- Specifier: ${f.specifier} (${f.registry}: ${f.registryStatus})`] : []),
    ``, `## Why`, f.detail, ``, `## Evidence`, ...f.evidence.map((e) => `- ${e}`), ``,
  ];
  if (f.lane === "authorship") {
    lines.push(`## Recommended action`, `This is a signal, not a defect, and it is never patched automatically. Decide what is accurate and disclose it: run \`assay_check_authorship\` for a draft "How this was built" section and edit it with your own account. Do not remove or hide the signal.`);
  } else if (!t.winner) {
    lines.push(`## Recommended action`, `No automatically generated patch passed the gate. A human or agent should fix this manually.`);
  } else {
    const w = t.winner;
    lines.push(
      `## Recommended patch (${w.candidate.strategy}, score ${w.total.toFixed(2)})`, w.candidate.summary, ``,
      "```diff", w.candidate.diff.trimEnd(), "```", ``,
      `Axes: ${Object.entries(w.axes).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")}`,
      `Gate: ${w.gate.checks.map((c) => `${c.ok ? "pass" : "FAIL"} ${c.name}`).join("; ")}`,
    );
    const others = t.ranked.filter((r) => r !== w);
    if (others.length) lines.push(``, `## Other candidates`, ...others.map((r) => `- ${r.candidate.strategy}: ${r.candidate.summary} — ${r.gate.eligible ? `score ${r.total.toFixed(2)}` : `ineligible (${r.gate.reason})`}`));
  }
  lines.push(``, `## Verify`, f.lane === "authorship" ? `Re-run \`assay_check_authorship\` after updating the README; the status should become \`disclosed\` and the signals should still be listed.` : `Re-run \`assay_review\` on the patched tree; this finding should be gone and no new finding of medium severity or higher should appear.`);
  return lines.join("\n") + "\n";
}
