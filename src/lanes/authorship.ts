import type { AuthorshipReport, Signal } from "@/authorship/types";
import type { Finding, Severity } from "@/core/types";
import { makeFinding, type Lane } from "./common";

const LABEL = { strong: "confirmed", moderate: "likely", speculative: "speculative" } as const;
const SEVERITY: Record<Signal["strength"], Severity> = { strong: "medium", moderate: "low", speculative: "low" };

/** A signal's location in finding terms: a file when it has one, otherwise the commit it points at. */
function where(s: Signal): { file: string; line: number } {
  if (s.file) return { file: s.file, line: s.line ?? 0 };
  return { file: `commit:${(s.commit ?? s.ref).slice(0, 7)}`, line: 0 };
}

export function reportToFindings(report: AuthorshipReport): Finding[] {
  const out: Finding[] = report.signals.map((s) => {
    const loc = where(s);
    const f = makeFinding({
      lane: "authorship", severity: SEVERITY[s.strength], label: LABEL[s.strength], ...loc,
      title: s.title, detail: s.caveat ? `${s.explanation} ${s.caveat}` : s.explanation,
      evidence: [`strength: ${s.strength}`, ...s.evidence],
    });
    return s.commit ? { ...f, commit: s.commit } : f;
  });
  if (report.status === "undisclosed" || report.status === "mismatch") {
    const doc = report.coverage.docsRead[0] ?? "README.md";
    const mismatch = report.status === "mismatch";
    out.push(makeFinding({
      lane: "authorship", severity: "high", label: "confirmed", file: doc, line: report.signals.find((s) => s.claim === "human-only")?.line ?? 0,
      title: mismatch ? "Disclosure mismatch: documentation says no AI use, but strong signals exist" : "Undisclosed AI-tool signals: no statement in the README or docs",
      detail: report.summary,
      evidence: [`status: ${report.status}`, `tools: ${report.disclosure.toolsDetected.join(", ") || "n/a"}`],
    }));
  }
  return out;
}

export const authorshipLane: Lane = ({ authorship }) => (authorship ? reportToFindings(authorship) : []);
