"use client";
import type { ScanView } from "@/core/service";
import { LabelBadge } from "../components/badges";
import { Info } from "../components/icons";
import { ScanGate } from "../components/scan-gate";
import { EmptyState } from "../components/states";
import { StatTile } from "../components/stat-tile";

const STATUS: Record<string, { text: string; glyph: string; cls: string }> = {
  "not-found": { text: "Not found", glyph: "✗", cls: "bg-confirmed-bg text-confirmed" },
  exists: { text: "Exists", glyph: "✓", cls: "bg-pass-bg text-pass" },
  unknown: { text: "Unknown", glyph: "?", cls: "bg-speculative-bg text-speculative" },
};
const KIND: Record<string, string> = { phantom: "Phantom / undeclared", typosquat: "Typosquat hint", "transitive-only": "Transitive only" };

export function DepsPanel({ d }: { d: ScanView["dependencies"] }) {
  const classes = Object.entries(d.importCounts).sort((a, b) => b[1] - a[1]);
  const maxClass = Math.max(1, ...classes.map(([, n]) => n));
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
        <Info width={14} height={14} className="mt-0.5 shrink-0" />
        <span>Popular-package lists are approximate snapshots (npm {d.popularSnapshot.npm}, PyPI {d.popularSnapshot.pypi}), not a verified top 500. Typosquat matches are hints, not proof.</span>
      </p>

      <dl aria-label="Dependency summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Manifests" value={d.manifests.length} hint="files read" />
        <StatTile label="Declared npm" value={d.declared.npm} hint="direct" />
        <StatTile label="Declared PyPI" value={d.declared.pypi} hint="direct" />
        <StatTile label="Issues" value={d.issues.length} tone={d.issues.length ? "fail" : "pass"} hint={d.issues.length ? "see table" : "none found"} />
      </dl>

      {d.warnings.length > 0 && (
        <div role="note" className="rounded-md border border-likely/50 bg-likely-bg px-3 py-2 text-xs text-likely">
          <strong>Manifest parse warnings</strong>
          <ul className="mt-1 list-disc pl-4">{d.warnings.map((w) => <li key={w} className="break-words">{w}</li>)}</ul>
        </div>
      )}
      {(d.customRegistry.npm || d.customRegistry.pypi || d.customRegistry.npmScopes.length > 0) && (
        <p className="text-xs text-muted">Custom registry detected ({[d.customRegistry.npm && "npm", d.customRegistry.pypi && "PyPI", ...d.customRegistry.npmScopes].filter(Boolean).join(", ")}): a registry 404 is downgraded to “likely”.</p>
      )}

      <section aria-label="Issues">
        <h2 className="mb-2 text-sm font-semibold">Issues</h2>
        {d.issues.length === 0 ? (
          <EmptyState title="No dependency issues">Every third-party import is declared in a manifest or lockfile.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <caption className="sr-only">Dependency issues</caption>
              <thead className="text-muted"><tr className="border-b border-line">{["Package", "Registry", "Status", "Verdict", "Where"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.issues.map((i, k) => {
                  const st = STATUS[i.registryStatus] ?? STATUS.unknown!;
                  return (
                    <tr key={k} className="border-b border-line last:border-0 align-top">
                      <th scope="row" className="px-3 py-2 font-mono font-medium">{i.packageName}{i.typosquatOf && <div className="font-sans font-normal text-muted">looks like {i.typosquatOf}</div>}</th>
                      <td className="px-3 py-2">{i.registry === "npm" ? "npm" : "PyPI"}</td>
                      <td className="px-3 py-2"><span className={`inline-flex h-5 items-center gap-1 rounded px-1.5 font-medium ${st.cls}`}><span aria-hidden>{st.glyph}</span>{st.text}</span></td>
                      <td className="px-3 py-2"><div className="flex flex-col items-start gap-1"><LabelBadge label={i.label} /><span className="text-muted">{KIND[i.kind] ?? i.kind}</span></div></td>
                      <td className="num px-3 py-2 font-mono">{i.file}:{i.line}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Imports by class" className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Imports by class</h2>
          <ul className="list-none space-y-2 p-0">
            {classes.map(([k, n]) => (
              <li key={k} className="grid grid-cols-[110px_1fr_28px] items-center gap-3 text-xs">
                <span className="font-mono text-muted">{k}</span>
                <span className="h-2 rounded-full bg-surface-2" aria-hidden><span className="block h-2 rounded-full bg-muted" style={{ width: `${(n / maxClass) * 100}%` }} /></span>
                <span className="num text-right font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Manifests read" className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Manifests read</h2>
          {d.manifests.length ? <ul className="list-none space-y-1 p-0 font-mono text-xs">{d.manifests.map((m) => <li key={m} className="break-all">{m}</li>)}</ul> : <p className="text-xs text-muted">No manifests or lockfiles found.</p>}
        </section>
      </div>
    </div>
  );
}

export function DepsView() {
  return <ScanGate loadingRows={3}>{(scan) => <DepsPanel d={scan.dependencies} />}</ScanGate>;
}
