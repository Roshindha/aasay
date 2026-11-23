"use client";
import { useCallback, useEffect, useState } from "react";
import type { ScanView } from "@/core/service";
import type { ScoredPatch } from "@/core/types";
import { GraphView } from "./graph-view";

type Tab = "verdicts" | "graph" | "tournament" | "handoffs" | "deps" | "budget";
interface Tourney { ranked: ScoredPatch[]; winner: ScoredPatch | null; handoff: string }

const LABEL_STYLE: Record<string, string> = { confirmed: "bg-red-900/60 text-red-200", likely: "bg-amber-900/60 text-amber-200", speculative: "bg-zinc-700 text-zinc-200" };
const SEV_STYLE: Record<string, string> = { critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-300", low: "text-zinc-400" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function Dashboard() {
  const [mode, setMode] = useState<"seeded" | "live">("seeded");
  const [seeded, setSeeded] = useState<ScanView | null>(null);
  const [live, setLive] = useState<ScanView | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("verdicts");
  const [selected, setSelected] = useState<string | null>(null);
  const [tourney, setTourney] = useState<Tourney | null>(null);

  const runSeeded = useCallback(async () => {
    setBusy(true); setError(null);
    try { const r = await fetch("/api/seeded"); setSeeded(await r.json()); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/seeded").then((r) => r.json()).then((j) => { if (live) { setSeeded(j); setBusy(false); } }).catch((e: Error) => { if (live) { setError(e.message); setBusy(false); } });
    return () => { live = false; };
  }, []);

  async function runLive() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/live", { method: "POST", body: JSON.stringify({ url }), headers: { "content-type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "scan failed");
      setLive(j); setMode("live"); setTourney(null); setSelected(null);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const scan = mode === "seeded" ? seeded : live;

  async function pick(findingId: string, goTo: Tab = "tournament") {
    if (!scan) return;
    setSelected(findingId); setTourney(null); setTab(goTo); setBusy(true); setError(null);
    try {
      const r = await fetch("/api/tournament", { method: "POST", body: JSON.stringify({ scanId: scan.id, findingId }), headers: { "content-type": "application/json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTourney(j);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const finding = scan?.findings.find((f) => f.id === selected);

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assay</h1>
          <p className="text-sm text-zinc-400">Reviews AI-written code across four lanes: hallucination, spec drift, test theater, phantom dependency.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {(["seeded", "live"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setSelected(null); setTourney(null); }} className={`rounded px-3 py-1.5 ${mode === m ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}>
              {m === "seeded" ? "Seeded run" : "Live scan"}
            </button>
          ))}
        </div>
      </header>

      {error && <div role="alert" className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{error}</div>}

      {mode === "seeded" ? (
        <section aria-label="Seeded run" className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Seeded benchmark <span className="text-xs text-zinc-500">(self-authored; measures plumbing, not real-world accuracy)</span></h2>
            <button onClick={runSeeded} disabled={busy} className="rounded bg-zinc-800 px-3 py-1 text-sm disabled:opacity-50">Re-run</button>
          </div>
          {seeded?.eval ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[["Recall", pct(seeded.eval.recall)], ["Precision", pct(seeded.eval.precision)], ["Critical recall", pct(seeded.eval.criticalRecall)], ["Gate", seeded.eval.gate.toUpperCase()], ["Bugs found", `${seeded.eval.found.length}/${seeded.eval.totalBugs}`]].map(([k, v]) => (
                <div key={k} className="rounded bg-zinc-950 p-3"><dt className="text-xs text-zinc-500">{k}</dt><dd className={`text-xl font-semibold ${k === "Gate" ? (v === "PASS" ? "text-emerald-400" : "text-red-400") : ""}`}>{v}</dd></div>
              ))}
            </dl>
          ) : <p className="text-sm text-zinc-500">{busy ? "Running…" : "No results yet."}</p>}
        </section>
      ) : (
        <section aria-label="Live scan" className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 font-medium">Live scan <span className="text-xs text-zinc-500">(no answer key, so no recall/precision is reported)</span></h2>
          <form onSubmit={(e) => { e.preventDefault(); void runLive(); }} className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo or .../pull/123" aria-label="GitHub URL" className="flex-1 rounded bg-zinc-950 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-zinc-400" />
            <button disabled={busy || !url} className="rounded bg-zinc-100 px-4 py-2 text-sm text-zinc-900 disabled:opacity-50">{busy ? "Scanning…" : "Scan"}</button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">Only api.github.com, registry.npmjs.org and pypi.org are contacted. Set GITHUB_TOKEN on the server for private repos / rate limits.</p>
          {live && <p className="mt-2 text-sm text-zinc-300">{live.summary.total} findings — {Object.entries(live.summary.byLabel).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}. {live.notes.join(" · ")}</p>}
        </section>
      )}

      {scan && (
        <>
          <nav className="flex flex-wrap gap-1 border-b border-zinc-800 text-sm" aria-label="Views">
            {([["verdicts", "Verdicts"], ["graph", "Evidence graph"], ["tournament", "Tournament"], ["handoffs", "Handoffs"], ["deps", "Dependencies"], ["budget", "Context budget"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 ${tab === k ? "border-b-2 border-zinc-100 text-zinc-100" : "text-zinc-400"}`}>{l}</button>
            ))}
          </nav>

          {tab === "verdicts" && (
            <ul className="space-y-2">
              {scan.findings.length === 0 && <li className="text-sm text-zinc-500">No findings.</li>}
              {scan.findings.map((f) => (
                <li key={f.id} className="rounded border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 ${LABEL_STYLE[f.label]}`}>{f.label}</span>
                    <span className={SEV_STYLE[f.severity]}>{f.severity}</span>
                    <span className="text-zinc-500">{f.lanes.join(" + ")}</span>
                    <span className="ml-auto font-mono text-zinc-400">{f.file}:{f.line}</span>
                  </div>
                  <p className="mt-1 font-medium">{f.title}</p>
                  <p className="text-sm text-zinc-400">{f.detail}</p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button onClick={() => pick(f.id, "tournament")} className="rounded bg-zinc-800 px-2 py-1">Patch tournament</button>
                    <button onClick={() => pick(f.id, "handoffs")} className="rounded bg-zinc-800 px-2 py-1">Handoff</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === "graph" && <GraphView graph={scan.graph} />}

          {tab === "tournament" && (
            <div className="space-y-3">
              {!finding && <p className="text-sm text-zinc-500">Pick “Patch tournament” on a finding in Verdicts.</p>}
              {finding && <p className="text-sm">For: <span className="font-medium">{finding.title}</span></p>}
              {finding && busy && <p className="text-sm text-zinc-500">Scoring candidates…</p>}
              {tourney && tourney.ranked.length === 0 && <p className="text-sm text-zinc-500">No automatic candidates for this finding; it needs human judgement.</p>}
              {tourney?.ranked.map((r) => (
                <div key={r.candidate.id} className={`rounded border p-3 ${r === tourney.ranked[0] && r.gate.eligible ? "border-emerald-700" : "border-zinc-800"} bg-zinc-900`}>
                  <div className="flex items-center justify-between text-sm">
                    <span><b>{r.candidate.strategy}</b> — {r.candidate.summary}</span>
                    <span className={r.gate.eligible ? "text-emerald-400" : "text-red-400"}>{r.gate.eligible ? `score ${r.total.toFixed(2)}` : `ineligible: ${r.gate.reason}`}</span>
                  </div>
                  {r.gate.eligible && <p className="mt-1 text-xs text-zinc-400">{Object.entries(r.axes).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}</p>}
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-950 p-2 text-xs">{r.candidate.diff}</pre>
                </div>
              ))}
            </div>
          )}

          {tab === "handoffs" && (
            <div>
              {!tourney && <p className="text-sm text-zinc-500">Pick “Handoff” on a finding in Verdicts.</p>}
              {tourney && <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">{tourney.handoff}</pre>}
            </div>
          )}

          {tab === "deps" && (
            <section aria-label="Dependencies" className="space-y-3 text-sm">
              <p className="rounded border border-amber-900 bg-amber-950/40 p-2 text-xs text-amber-200">
                Popular-package lists are approximate snapshots (npm {scan.dependencies.popularSnapshot.npm}, PyPI {scan.dependencies.popularSnapshot.pypi}), not a verified top 500. Typosquat matches are hints.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Manifests</div>{scan.dependencies.manifests.map((m) => <div key={m} className="font-mono text-xs">{m}</div>)}{!scan.dependencies.manifests.length && "none found"}</div>
                <div className="rounded bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Declared (direct)</div>npm {scan.dependencies.declared.npm} · PyPI {scan.dependencies.declared.pypi}</div>
                <div className="rounded bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Imports by class</div>{Object.entries(scan.dependencies.importCounts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div>
              </div>
              {(scan.dependencies.customRegistry.npm || scan.dependencies.customRegistry.pypi) && <p className="text-xs text-zinc-400">Custom registry detected: registry 404s are downgraded to “likely”.</p>}
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500"><tr><th className="py-1">Package</th><th>Registry</th><th>Status</th><th>Verdict</th><th>Where</th></tr></thead>
                <tbody>
                  {scan.dependencies.issues.map((i, k) => (
                    <tr key={k} className="border-t border-zinc-800"><td className="py-1 font-mono">{i.packageName}</td><td>{i.registry}</td><td>{i.registryStatus}</td><td><span className={`rounded px-1 ${LABEL_STYLE[i.label]}`}>{i.kind}/{i.label}</span></td><td className="font-mono">{i.file}:{i.line}</td></tr>
                  ))}
                  {!scan.dependencies.issues.length && <tr><td colSpan={5} className="py-2 text-zinc-500">No dependency issues.</td></tr>}
                </tbody>
              </table>
            </section>
          )}

          {tab === "budget" && (
            <section aria-label="Context budget" className="space-y-3 text-sm">
              <p>Inspected {scan.telemetry.inspectedFiles.length} files · ≈ {scan.telemetry.totalEstTokens.toLocaleString()} tokens (chars ÷ 4) · LLM: {scan.llm}</p>
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500"><tr><th>File</th><th>Chars</th><th>≈ Tokens</th></tr></thead>
                <tbody>{scan.telemetry.inspectedFiles.map((f) => <tr key={f.path} className="border-t border-zinc-800"><td className="py-1 font-mono">{f.path}</td><td>{f.chars}</td><td>{f.estTokens}</td></tr>)}</tbody>
              </table>
              <details><summary className="cursor-pointer text-zinc-400">Cache keys ({scan.telemetry.cacheKeys.length})</summary><ul className="mt-1 font-mono text-xs text-zinc-400">{scan.telemetry.cacheKeys.map((k) => <li key={k}>{k}</li>)}</ul></details>
            </section>
          )}
        </>
      )}
    </main>
  );
}
