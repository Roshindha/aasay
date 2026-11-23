"use client";
import type { ScoredPatch } from "@/core/types";
import { CheckCircle, XCircle } from "../components/icons";
import { CodeBlock } from "../components/code-block";
import { EmptyState } from "../components/states";
import { FixFrame } from "./fix-shared";
import { useView } from "../use-view";

const AXES = ["correctness", "safety", "minimality", "maintainability", "testability"] as const;

function Bar({ value }: { value: number }) {
  return <span className="block h-1.5 rounded-full bg-surface-2" aria-hidden><span className="block h-1.5 rounded-full bg-muted" style={{ width: `${Math.round(value * 100)}%` }} /></span>;
}

export function Candidate({ r, recommended }: { r: ScoredPatch; recommended: boolean }) {
  const ok = r.gate.eligible;
  return (
    <li data-testid="candidate" data-eligible={ok} className={`rounded-lg border bg-surface p-4 ${recommended ? "border-pass/60" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 items-center rounded bg-surface-2 px-1.5 text-xs font-semibold capitalize">{r.candidate.strategy}</span>
        {recommended && <span className="inline-flex h-5 items-center gap-1 rounded bg-pass-bg px-1.5 text-xs font-semibold text-pass"><CheckCircle width={12} height={12} />Recommended</span>}
        {!ok && <span className="inline-flex h-5 items-center gap-1 rounded bg-confirmed-bg px-1.5 text-xs font-semibold text-confirmed"><XCircle width={12} height={12} />Ineligible</span>}
        <span className="num ml-auto text-sm font-semibold">{ok ? `${r.total.toFixed(2)} / 1.00` : "score 0"}</span>
      </div>
      <p className="mt-1 text-sm">{r.candidate.summary}</p>
      {ok ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {AXES.map((a) => (
            <div key={a} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-xs">
              <dt className="capitalize text-muted">{a}</dt><dd className="m-0"><Bar value={r.axes[a]} /></dd><dd className="num m-0 text-right font-medium">{r.axes[a].toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-2 text-xs text-confirmed">{r.gate.reason ?? "Failed the gate"}</p>}
      <ul className="mt-3 list-none space-y-0.5 p-0 text-xs" aria-label="Gate checks">
        {r.gate.checks.map((c) => (
          <li key={c.name} className="flex items-start gap-1.5">
            {c.ok ? <CheckCircle width={12} height={12} className="mt-0.5 shrink-0 text-pass" /> : <XCircle width={12} height={12} className="mt-0.5 shrink-0 text-confirmed" />}
            <span><span className="font-mono">{c.name}</span> <span className="text-muted">{c.ok ? "passed" : "failed"}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-3"><CodeBlock title={`Patch diff (${r.candidate.strategy})`} code={r.candidate.diff} diff maxHeight="14rem" /></div>
    </li>
  );
}

export function TournamentView() {
  const [, go] = useView();
  return (
    <FixFrame loadingLabel="Scoring candidate patches">
      {(_f, t) => t.ranked.length === 0 ? (
        <EmptyState title="No automatic patch for this finding"
          action={<button type="button" onClick={() => go("handoffs")} className="h-7 rounded border border-line px-2 text-xs font-medium hover:bg-surface-2">Open handoff</button>}>
          This kind of finding needs human judgement (for example a signature that differs from the spec). The handoff view still gives you the evidence and verification steps.
        </EmptyState>
      ) : (
        <ul className="list-none space-y-3 p-0">{t.ranked.map((r) => <Candidate key={r.candidate.id} r={r} recommended={t.winner?.candidate.id === r.candidate.id} />)}</ul>
      )}
    </FixFrame>
  );
}
