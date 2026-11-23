"use client";
import { useEffect, type ReactNode } from "react";
import type { Finding } from "@/core/types";
import { FindingPicker } from "../components/finding-picker";
import { ScanGate } from "../components/scan-gate";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApp, type Tourney } from "../state";

/** Finding picker + automatic tournament load, shared by the Tournament and Handoffs views. */
export function FixFrame({ children, loadingLabel }: { children: (f: Finding, t: Tourney) => ReactNode; loadingLabel: string }) {
  return <ScanGate>{(scan) => <Inner findings={scan.findings} loadingLabel={loadingLabel}>{children}</Inner>}</ScanGate>;
}

function Inner({ findings, children, loadingLabel }: { findings: Finding[]; children: (f: Finding, t: Tourney) => ReactNode; loadingLabel: string }) {
  const { selectedId, selectFinding, tournament, loadTournament } = useApp();
  const first = findings[0]?.id ?? null;
  const active = findings.find((f) => f.id === selectedId) ?? null;

  useEffect(() => { if (!active && first) selectFinding(first); }, [active, first, selectFinding]);
  useEffect(() => { if (active && tournament.status === "idle") loadTournament(active.id); }, [active, tournament.status, loadTournament]);

  if (findings.length === 0) return <EmptyState title="No findings to fix">This scan reported nothing, so there is nothing to patch.</EmptyState>;
  return (
    <div className="space-y-4">
      <FindingPicker findings={findings} value={active?.id ?? first} onChange={selectFinding} />
      {(tournament.status === "loading" || (tournament.status === "idle")) && <LoadingState label={loadingLabel} rows={2} rowHeight={120} />}
      {tournament.status === "error" && active && <ErrorState title="Could not score patches" message={tournament.error ?? "Unknown error"} onRetry={() => loadTournament(active.id)} />}
      {tournament.status === "ok" && tournament.data && active && children(active, tournament.data)}
    </div>
  );
}
