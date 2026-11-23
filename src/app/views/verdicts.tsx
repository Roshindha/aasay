"use client";
import { useMemo, useState } from "react";
import type { Finding, Label } from "@/core/types";
import { LabelBadge, LaneTag, SeverityBadge } from "../components/badges";
import { Inline } from "../components/inline";
import { ScanGate } from "../components/scan-gate";
import { EmptyState } from "../components/states";
import { useApp } from "../state";
import { useView } from "../use-view";

const LABELS: Array<Label | "all"> = ["all", "confirmed", "likely", "speculative"];

export function FindingCard({ f, onFix, onHandoff }: { f: Finding; onFix?: () => void; onHandoff?: () => void }) {
  return (
    <li data-testid="finding" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LabelBadge label={f.label} />
        <SeverityBadge severity={f.severity} />
        {(f.lanes.length ? f.lanes : [f.lane]).map((l) => <LaneTag key={l} lane={l} />)}
        <span className="num ml-auto font-mono text-xs text-muted" data-testid="finding-location"><span className="sr-only">Location: </span>{f.file}:{f.line}</span>
      </div>
      <h2 className="mt-2 text-sm font-semibold"><Inline text={f.title} /></h2>
      <p className="mt-0.5 text-sm text-muted"><Inline text={f.detail} /></p>
      {f.evidence.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Evidence</div>
          <ul className="mt-1 list-none space-y-0.5 border-l-2 border-line pl-3 font-mono text-xs">
            {f.evidence.map((e, i) => <li key={i} className="break-words">{e}</li>)}
          </ul>
        </div>
      )}
      {(onFix || onHandoff) && (
        <div className="mt-3 flex gap-2">
          {onFix && <button type="button" onClick={onFix} className="h-7 rounded border border-line bg-surface px-2 text-xs font-medium hover:bg-surface-2">Patch tournament</button>}
          {onHandoff && <button type="button" onClick={onHandoff} className="h-7 rounded border border-line bg-surface px-2 text-xs font-medium hover:bg-surface-2">Handoff</button>}
        </div>
      )}
    </li>
  );
}

function VerdictList({ findings }: { findings: Finding[] }) {
  const { selectFinding } = useApp();
  const [, go] = useView();
  const [label, setLabel] = useState<Label | "all">("all");
  const [lane, setLane] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: findings.length };
    for (const f of findings) c[f.label] = (c[f.label] ?? 0) + 1;
    return c;
  }, [findings]);
  const lanes = useMemo(() => ["all", ...new Set(findings.map((f) => f.lane))], [findings]);
  const shown = findings.filter((f) => (label === "all" || f.label === label) && (lane === "all" || f.lanes.includes(lane as Finding["lane"])) && (!q || `${f.title} ${f.detail} ${f.file}`.toLowerCase().includes(q.toLowerCase())));
  const chip = (active: boolean) => `h-7 rounded border px-2 text-xs font-medium ${active ? "border-fg bg-fg text-bg" : "border-line bg-surface hover:bg-surface-2"}`;

  if (findings.length === 0) return <EmptyState title="No findings">None of the four lanes reported anything for this scan.</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div role="group" aria-label="Filter by label" className="flex flex-wrap gap-2">
          {LABELS.map((l) => <button key={l} type="button" aria-pressed={label === l} onClick={() => setLabel(l)} className={chip(label === l)}>{l === "all" ? "All" : l[0]!.toUpperCase() + l.slice(1)} <span className="num opacity-80">{counts[l] ?? 0}</span></button>)}
        </div>
        <div role="group" aria-label="Filter by lane" className="flex flex-wrap gap-2">
          {lanes.map((l) => <button key={l} type="button" aria-pressed={lane === l} onClick={() => setLane(l)} className={chip(lane === l)}>{l === "all" ? "All lanes" : l}</button>)}
        </div>
        <label className="block"><span className="sr-only">Search findings</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, detail, file…" className="h-8 w-full rounded border border-line bg-bg px-3 text-sm placeholder:text-muted sm:max-w-xs" />
        </label>
        <p className="num text-xs text-muted" aria-live="polite">Showing {shown.length} of {findings.length}</p>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No findings match these filters" action={<button type="button" onClick={() => { setLabel("all"); setLane("all"); setQ(""); }} className="h-7 rounded border border-line px-2 text-xs font-medium hover:bg-surface-2">Clear filters</button>} />
      ) : (
        <ul className="list-none space-y-3 p-0">
          {shown.map((f) => <FindingCard key={f.id} f={f} onFix={() => { selectFinding(f.id); go("tournament"); }} onHandoff={() => { selectFinding(f.id); go("handoffs"); }} />)}
        </ul>
      )}
    </div>
  );
}

export function VerdictsView() {
  return <ScanGate>{(scan) => <VerdictList findings={scan.findings} />}</ScanGate>;
}
