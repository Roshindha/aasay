import { CopyButton } from "./copy-button";

/** Monospace, horizontally scrollable, with a copy button. Diff lines (+/-) get a tinted background plus the sign character. */
export function CodeBlock({ code, title, diff = false, maxHeight = "20rem" }: { code: string; title: string; diff?: boolean; maxHeight?: string }) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-code">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="truncate text-xs font-medium text-muted">{title}</span>
        <CopyButton text={code} label="Copy" ariaLabel={`Copy ${title}`} />
      </figcaption>
      <pre tabIndex={0} aria-label={title} className="overflow-auto p-0 font-mono text-xs leading-5" style={{ maxHeight }}>
        <code className="block min-w-max py-2">
          {lines.map((l, i) => {
            const kind = diff ? (l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : "") : "";
            return (
              <span key={i} data-diff={kind || undefined} className={`block px-3 ${kind === "add" ? "bg-add" : kind === "del" ? "bg-del" : kind === "hunk" ? "text-muted" : ""}`}>{l || " "}</span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
