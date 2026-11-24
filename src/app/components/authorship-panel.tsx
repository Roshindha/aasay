"use client";
import type { AuthorshipReport } from "@/authorship/types";
import type { DisclosureDraft } from "@/authorship/disclosure";
import { DisclosureBadge, OverallBadge, StrengthBadge } from "./badges";
import { CodeBlock } from "./code-block";
import { Info } from "./icons";
import { Inline } from "./inline";
import { StatTile } from "./stat-tile";

const KIND: Record<string, string> = {
  "commit-trailer": "commit trailer", "bot-author": "AI author", "tool-file": "tool file", "readme-statement": "README statement", "history-pattern": "history pattern", "style-pattern": "code style",
};
const STATUS_HELP: Record<string, string> = {
  disclosed: "Signals are present and the documentation discloses AI use.",
  undisclosed: "Strong signals are present and no disclosure was found.",
  mismatch: "The documentation claims no AI use, but strong signals exist.",
  "none-found": "No strong signals. This is not proof of how the code was written.",
};

export function AuthorshipPanel({ report, disclosure, title }: { report: AuthorshipReport; disclosure: DisclosureDraft; title?: string }) {
  const order = { strong: 0, moderate: 1, speculative: 2 } as const;
  const signals = [...report.signals].sort((a, b) => order[a.strength] - order[b.strength]);
  return (
    <div className="space-y-6">
      <section aria-label="Disclosure status" className="rounded-lg border border-line bg-surface p-4">
        {title && <div className="mb-2 text-xs font-medium text-muted">{title}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <DisclosureBadge status={report.status} />
          <OverallBadge overall={report.overall} />
          <span className="text-xs text-muted">{STATUS_HELP[report.status]}</span>
        </div>
        <p className="mt-3 text-sm" data-testid="authorship-summary">{report.summary}</p>
        <p className="mt-3 flex items-start gap-2 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          <Info width={14} height={14} className="mt-0.5 shrink-0" />
          <span><strong className="text-fg">Signals, not verdicts.</strong> {report.caveats[0]} {report.caveats[2]}</span>
        </p>
      </section>

      <dl aria-label="Signal counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Strong" value={report.counts.strong} hint="tool files, trailers, AI authors" />
        <StatTile label="Moderate" value={report.counts.moderate} hint="README statements, history" />
        <StatTile label="Speculative" value={report.counts.speculative} hint="code style; never changes the result" />
        <StatTile label="Looked at" value={`${report.coverage.commits}`} hint={`commits · ${report.coverage.paths} paths${report.coverage.commitStats ? "" : " · no line stats"}`} />
      </dl>

      <section aria-label="Signals">
        <h2 className="mb-2 text-sm font-semibold">Signals</h2>
        {signals.length === 0 ? (
          <p data-testid="no-signals" className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm text-muted">No signals found. That says nothing certain about how the code was written; read the caveats above.</p>
        ) : (
          <ul className="list-none space-y-3 p-0">
            {signals.map((s) => (
              <li key={s.id} data-testid="signal" data-strength={s.strength} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StrengthBadge strength={s.strength} />
                  <span className="inline-flex h-5 items-center rounded border border-line px-1.5 font-mono text-xs text-muted">{KIND[s.kind] ?? s.kind}</span>
                  {s.tool && <span className="text-xs text-muted">{s.tool}</span>}
                  {s.file && <span className="num ml-auto font-mono text-xs text-muted">{s.file}{s.line ? `:${s.line}` : ""}</span>}
                </div>
                <h3 className="mt-2 text-sm font-semibold"><Inline text={s.title} /></h3>
                <p className="mt-0.5 text-sm text-muted">{s.explanation}</p>
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Evidence</div>
                  <ul className="mt-1 list-none space-y-0.5 border-l-2 border-line pl-3 font-mono text-xs">{s.evidence.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>
                </div>
                {s.caveat && <p data-testid="signal-caveat" className="mt-3 rounded bg-speculative-bg px-3 py-2 text-xs text-speculative"><strong>False-positive caveat.</strong> {s.caveat}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Disclosure draft" className="space-y-2">
        <h2 className="text-sm font-semibold">Disclosure draft</h2>
        <p className="text-xs text-muted">A starting point for a &ldquo;How this was built&rdquo; README section. It only states what the strong and moderate signals support, and leaves your own account blank. Edit it, keep what is accurate, and publish only what you choose to.</p>
        <CodeBlock title="How this was built (markdown draft)" code={disclosure.markdown} maxHeight="28rem" />
        <p className="text-xs text-muted">Assay reports signals so you can disclose them accurately. It does not remove, hide or rewrite them, or help a repository pass as human-written.</p>
      </section>
    </div>
  );
}
