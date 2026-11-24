import { draftDisclosure, type DisclosureDraft, type OwnerAccount } from "./disclosure";
import { evaluateAuthorship, listAuthorshipCases, reportForCase, type AuthorshipEval } from "./eval";
import { checkRequestPolicy } from "./policy";
import type { AuthorshipReport } from "./types";

export interface CaseSummary { id: string; description: string; humanWritten: boolean; status: string; overall: string; counts: AuthorshipReport["counts"] }
export interface CaseDetail { id: string; description: string; humanWritten: boolean; report: AuthorshipReport; disclosure: DisclosureDraft }

/** Throws when the free-text request asks Assay to conceal authorship signals. */
export function assertRequestAllowed(request?: string): void {
  const d = checkRequestPolicy(request ?? "");
  if (!d.allowed) throw new Error(d.reason);
}

export function authorshipOverview(): { cases: CaseSummary[]; eval: AuthorshipEval } {
  return {
    cases: listAuthorshipCases().map((c) => { const r = reportForCase(c); return { id: c.id, description: c.description, humanWritten: c.humanWritten, status: r.status, overall: r.overall, counts: r.counts }; }),
    eval: evaluateAuthorship(),
  };
}

export function authorshipCase(id: string, owner?: OwnerAccount): CaseDetail {
  const c = listAuthorshipCases().find((x) => x.id === id);
  if (!c) throw new Error(`Unknown authorship fixture "${id}". Known: ${listAuthorshipCases().map((x) => x.id).join(", ")}`);
  const report = reportForCase(c);
  return { id: c.id, description: c.description, humanWritten: c.humanWritten, report, disclosure: draftDisclosure(report, owner) };
}
