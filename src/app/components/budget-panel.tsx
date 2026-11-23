import type { Telemetry } from "@/core/types";
import { CopyButton } from "./copy-button";

/** Compact telemetry: total, per-file bars scaled to the largest file, and collapsible cache keys. */
export function BudgetPanel({ telemetry, llm }: { telemetry: Telemetry; llm?: string }) {
  const files = [...telemetry.inspectedFiles].sort((a, b) => b.estTokens - a.estTokens);
  const max = Math.max(1, ...files.map((f) => f.estTokens));
  return (
    <section aria-label="Context budget" className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Context budget</h3>
        <p className="num text-xs text-muted">
          <span data-testid="budget-total" className="text-sm font-semibold text-fg">≈ {telemetry.totalEstTokens.toLocaleString("en-US")}</span> tokens · {files.length} files (chars ÷ 4){llm ? ` · LLM: ${llm}` : ""}
        </p>
      </header>
      <ul className="max-h-72 list-none space-y-1 overflow-auto p-4">
        {files.map((f) => (
          <li key={f.path} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_72px]">
            <span className="truncate font-mono text-xs" title={f.path}>{f.path}</span>
            <span className="hidden h-2 rounded-full bg-surface-2 sm:block" aria-hidden>
              <span className="block h-2 rounded-full bg-muted" style={{ width: `${Math.max(2, (f.estTokens / max) * 100)}%` }} />
            </span>
            <span className="num text-right text-xs text-muted">{f.estTokens.toLocaleString("en-US")} tok</span>
          </li>
        ))}
      </ul>
      <details className="border-t border-line px-4 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted">Cache keys ({telemetry.cacheKeys.length})</summary>
        <div className="mt-2 flex items-start justify-between gap-2">
          <ul className="max-h-40 list-none space-y-0.5 overflow-auto p-0 font-mono text-xs text-muted">
            {telemetry.cacheKeys.map((k) => <li key={k} className="break-all">{k}</li>)}
          </ul>
          <CopyButton text={telemetry.cacheKeys.join("\n")} label="Copy all" ariaLabel="Copy all cache keys" />
        </div>
      </details>
    </section>
  );
}
