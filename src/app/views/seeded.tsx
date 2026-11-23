"use client";
import { BudgetPanel } from "../components/budget-panel";
import { StatusPill } from "../components/badges";
import { Refresh } from "../components/icons";
import { StatTile } from "../components/stat-tile";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApp } from "../state";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const LANES = ["hallucination", "spec-drift", "test-theater", "phantom-dependency"];

export function SeededView() {
  const { seeded, loadSeeded, setSource } = useApp();
  const d = seeded.data;
  const ev = d?.eval;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">
          Runs the four lanes over <code className="font-mono">fixtures/seeded-demo</code> with recorded registry answers (no network), then scores the findings against the planted-bug answer key.
        </p>
        <button type="button" onClick={() => { setSource("seeded"); loadSeeded(); }} disabled={seeded.status === "loading"}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2 disabled:opacity-60">
          <Refresh width={14} height={14} />Re-run
        </button>
      </div>

      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
        <strong className="text-fg">Self-authored benchmark.</strong> The planted bugs and the detectors were written together, so these numbers show the plumbing works; they do not measure real-world accuracy.
      </p>

      {seeded.status === "error" && <ErrorState title="Seeded run failed" message={seeded.error ?? "Unknown error"} onRetry={loadSeeded} />}

      {seeded.status === "loading" && !d && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="loading-state" role="status" aria-busy="true">
          <span className="sr-only">Running seeded benchmark…</span>
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-[88px]" />)}
        </div>
      )}

      {ev && d && (
        <>
          <dl aria-label="Eval metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Gate" tone={ev.gate === "pass" ? "pass" : "fail"}
              value={<StatusPill status={ev.gate === "pass" ? "pass" : "fail"}>{ev.gate.toUpperCase()}</StatusPill>}
              hint={ev.gateReasons.length ? ev.gateReasons.join("; ") : "recall ≥ 80%, precision ≥ 80%, all critical found"} />
            <StatTile label="Recall" value={pct(ev.recall)} hint={`${ev.found.length} of ${ev.totalBugs} bugs`} />
            <StatTile label="Precision" value={pct(ev.precision)} hint={`${ev.totalFindings - ev.falsePositives.length} of ${ev.totalFindings} findings`} />
            <StatTile label="Critical recall" value={pct(ev.criticalRecall)} hint="planted critical bugs" />
            <StatTile label="Bugs found" value={`${ev.found.length}/${ev.totalBugs}`} hint={ev.missed.length ? `missed: ${ev.missed.join(", ")}` : "none missed"} />
          </dl>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Answer key coverage" className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Answer-key coverage</h2>
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {[...ev.found.map((id) => ({ id, ok: true })), ...ev.missed.map((id) => ({ id, ok: false }))].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, ok }) => (
                  <li key={id} className={`num inline-flex h-6 items-center gap-1 rounded px-2 font-mono text-xs ${ok ? "bg-pass-bg text-pass" : "bg-confirmed-bg text-confirmed"}`}>
                    <span aria-hidden>{ok ? "✓" : "✗"}</span>{id}<span className="sr-only">{ok ? " found" : " missed"}</span>
                  </li>
                ))}
              </ul>
              {ev.falsePositives.length > 0 && (
                <div className="mt-3 text-xs"><div className="font-medium">Unmatched findings</div><ul className="mt-1 list-disc pl-4 text-muted">{ev.falsePositives.map((f) => <li key={f}>{f}</li>)}</ul></div>
              )}
            </section>
            <section aria-label="Findings by lane" className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Findings by lane</h2>
              <ul className="list-none space-y-2 p-0">
                {LANES.map((l) => {
                  const n = d.summary.byLane[l] ?? 0;
                  return (
                    <li key={l} className="grid grid-cols-[120px_1fr_24px] items-center gap-3 text-xs">
                      <span className="font-mono text-muted">{l}</span>
                      <span className="h-2 rounded-full bg-surface-2" aria-hidden><span className="block h-2 rounded-full bg-muted" style={{ width: `${Math.min(100, (n / Math.max(1, d.summary.total)) * 100 * 2)}%` }} /></span>
                      <span className="num text-right font-semibold">{n}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="num mt-3 text-xs text-muted">{d.summary.total} findings · {Object.entries(d.summary.byLabel).map(([k, v]) => `${v} ${k}`).join(" · ")}</p>
            </section>
          </div>
          <BudgetPanel telemetry={d.telemetry} llm={d.llm} />
        </>
      )}

      {seeded.status === "ok" && !d && <EmptyState title="No results">The seeded run returned no data.</EmptyState>}
      {seeded.status === "loading" && d && <LoadingState label="Re-running" rows={0} />}
    </div>
  );
}
