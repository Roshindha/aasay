"use client";
import { useId, useState } from "react";
import { LabelBadge } from "../components/badges";
import { StatTile } from "../components/stat-tile";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { useApp } from "../state";
import { useView } from "../use-view";

export const GITHUB_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/pull\/\d+)?(\/.*)?$/;
const EXAMPLES = ["https://github.com/owner/repo", "https://github.com/owner/repo/pull/123"];

export function LiveView() {
  const { live, runLive } = useApp();
  const [, go] = useView();
  const [url, setUrl] = useState("");
  const inputId = useId();
  const hintId = useId();
  const trimmed = url.trim();
  const valid = GITHUB_URL.test(trimmed);
  const loading = live.status === "loading";
  const d = live.data;

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); if (valid && !loading) void runLive(trimmed); }} className="rounded-lg border border-line bg-surface p-4">
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium">GitHub repository or pull request URL</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id={inputId} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" inputMode="url" autoComplete="off" spellCheck={false}
            aria-describedby={hintId} aria-invalid={trimmed.length > 0 && !valid}
            className="h-9 flex-1 rounded border border-line bg-bg px-3 font-mono text-sm placeholder:text-muted" />
          <button type="submit" disabled={!valid || loading} className="h-9 rounded bg-fg px-4 text-sm font-medium text-bg disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Scanning…" : "Scan"}
          </button>
        </div>
        <p id={hintId} className="mt-2 text-xs text-muted">
          {trimmed && !valid ? <span className="text-confirmed">Enter a URL like https://github.com/owner/repo or …/pull/123.</span> : "Only api.github.com, registry.npmjs.org and pypi.org are contacted."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Examples:</span>
          {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setUrl(ex)} className="rounded border border-line px-2 py-0.5 font-mono hover:bg-surface-2">{ex.replace("https://github.com/", "")}</button>)}
        </div>
      </form>

      <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
        <strong className="text-fg">No answer key here.</strong> Live scans report counts only; recall and precision exist only for the seeded run.
      </p>

      {loading && <LoadingState label="Scanning repository" rows={3} rowHeight={88} />}
      {live.status === "error" && !loading && <ErrorState title="Scan failed" message={live.error ?? "Unknown error"} onRetry={valid ? () => void runLive(trimmed) : undefined} />}

      {live.status === "idle" && (
        <EmptyState title="No live scan yet">
          Paste a public GitHub repository or pull request URL above. For a pull request, changed files are reviewed and the repository&apos;s manifests are fetched for context.
          Private repositories and higher rate limits need <code className="font-mono">GITHUB_TOKEN</code> set on the server; the token is never shown here.
        </EmptyState>
      )}

      {d && !loading && (
        <section aria-label="Live scan result" className="space-y-4">
          <p className="break-all font-mono text-xs text-muted">{d.label}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Findings" value={d.summary.total} hint={d.notes.join(" · ")} />
            {(["confirmed", "likely", "speculative"] as const).map((l) => (
              <StatTile key={l} label={l} value={d.summary.byLabel[l] ?? 0} hint={<LabelBadge label={l} />} />
            ))}
          </dl>
          {d.summary.total === 0 && <EmptyState title="No findings">Nothing in the fetched files tripped a lane.</EmptyState>}
          <div className="flex gap-2">
            <button type="button" onClick={() => go("verdicts")} className="h-8 rounded border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2">View verdicts</button>
            <button type="button" onClick={() => go("deps")} className="h-8 rounded border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2">View dependencies</button>
          </div>
        </section>
      )}
    </div>
  );
}
