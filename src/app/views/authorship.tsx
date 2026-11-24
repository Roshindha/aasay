"use client";
import { useEffect, useState } from "react";
import type { AuthorshipEval } from "@/authorship/eval";
import type { CaseDetail, CaseSummary } from "@/authorship/service";
import { AuthorshipPanel } from "../components/authorship-panel";
import { DisclosureBadge, OverallBadge } from "../components/badges";
import { ScanGate } from "../components/scan-gate";
import { StatTile } from "../components/stat-tile";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApp } from "../state";

type Mode = "fixtures" | "scan";
interface Overview { cases: CaseSummary[]; eval: AuthorshipEval }
const pct = (n: number) => `${Math.round(n * 100)}%`;

function useJson<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Request failed"); return j as T; })
      .then((data) => { if (live) setState({ url, data, error: null }); })
      .catch((e: Error) => { if (live) setState({ url, data: null, error: e.message }); });
    return () => { live = false; };
  }, [url, tick]);
  const loading = !!url && state.url !== url;
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : null, loading, retry: () => { setState({ url: null, data: null, error: null }); setTick((t) => t + 1); } };
}

function Fixtures() {
  const overview = useJson<Overview>("/api/authorship");
  const [picked, setPicked] = useState<string | null>(null);
  const first = overview.data?.cases[0]?.id ?? null;
  const caseId = picked ?? first;
  const detail = useJson<CaseDetail>(caseId ? `/api/authorship?case=${encodeURIComponent(caseId)}` : null);

  if (overview.error) return <ErrorState title="Could not load the authorship fixtures" message={overview.error} onRetry={overview.retry} />;
  if (!overview.data) return <LoadingState label="Loading authorship fixtures" rows={3} rowHeight={88} />;
  const ev = overview.data.eval;
  return (
    <div className="space-y-6">
      <section aria-label="Authorship eval" className="space-y-3">
        <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted"><strong className="text-fg">Self-authored benchmark.</strong> The fixtures and the detectors were written together, so these numbers show the plumbing works; they do not measure real-world accuracy.</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Authorship eval metrics">
          <StatTile label="Precision" value={pct(ev.precision)} hint={`${ev.strongModerateReported} strong+moderate reported`} />
          <StatTile label="Recall" value={pct(ev.recall)} hint={`${ev.strongModerateExpected} expected`} />
          <StatTile label="False positives" tone={ev.falsePositiveRate === 0 ? "pass" : "fail"} value={pct(ev.falsePositiveRate)} hint={`${ev.falsePositives.length} of ${ev.humanFixtures} human-written fixtures`} />
          <StatTile label="Status accuracy" value={pct(ev.statusAccuracy)} hint={`${ev.cases.length} fixture repos`} />
        </dl>
      </section>

      <section aria-label="Fixture repositories">
        <label htmlFor="fixture-select" className="mb-1 block text-xs font-medium text-muted">Fixture repository</label>
        <select id="fixture-select" value={caseId ?? ""} onChange={(e) => setPicked(e.target.value)} className="h-9 w-full rounded border border-line bg-surface px-2 text-sm">
          {overview.data.cases.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.humanWritten ? "human-written" : "AI-assisted"}</option>)}
        </select>
        <ul className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2" aria-label="All fixtures">
          {overview.data.cases.map((c) => (
            <li key={c.id}><button type="button" aria-pressed={c.id === caseId} onClick={() => setPicked(c.id)} className={`flex w-full flex-col items-start gap-1 rounded border p-2 text-left text-xs ${c.id === caseId ? "border-focus bg-surface-2" : "border-line bg-surface hover:bg-surface-2"}`}>
              <span className="font-mono text-sm font-medium">{c.id}</span>
              <span className="flex flex-wrap items-center gap-2"><DisclosureBadge status={c.status as never} /><OverallBadge overall={c.overall as never} /></span>
            </button></li>
          ))}
        </ul>
      </section>

      {detail.loading && <LoadingState label="Loading report" rows={2} rowHeight={120} />}
      {detail.error && <ErrorState title="Could not load this fixture" message={detail.error} onRetry={detail.retry} />}
      {detail.data && <>
        <p className="text-sm text-muted">{detail.data.description}</p>
        <AuthorshipPanel report={detail.data.report} disclosure={detail.data.disclosure} title={`Fixture: ${detail.data.id}`} />
      </>}
    </div>
  );
}

function CurrentScan() {
  return (
    <ScanGate loadingRows={2} loadingHeight={140}>
      {(scan) => scan.authorship ? <AuthorshipPanel report={scan.authorship.report} disclosure={scan.authorship.disclosure} title={`Scan: ${scan.label}`} /> : <EmptyState title="No authorship report">This scan did not include one.</EmptyState>}
    </ScanGate>
  );
}

export function AuthorshipView() {
  const { source } = useApp();
  const [mode, setMode] = useState<Mode>(source === "live" ? "scan" : "fixtures");
  const seg = (active: boolean) => `h-8 px-3 text-xs font-medium ${active ? "bg-fg text-bg" : "bg-surface hover:bg-surface-2"}`;
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm text-muted">Which signals of AI-assisted authorship does a repository contain, and is that disclosed? Assay lists signals with their strength and evidence. It never says who or what wrote the code.</p>
      <div role="group" aria-label="Authorship source" className="inline-flex overflow-hidden rounded border border-line">
        <button type="button" aria-pressed={mode === "fixtures"} onClick={() => setMode("fixtures")} className={seg(mode === "fixtures")}>Fixture repos</button>
        <button type="button" aria-pressed={mode === "scan"} onClick={() => setMode("scan")} className={seg(mode === "scan")}>Current scan</button>
      </div>
      {mode === "fixtures" ? <Fixtures /> : <CurrentScan />}
    </div>
  );
}
