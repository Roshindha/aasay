"use client";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { EvidenceGraph, Finding } from "@/core/types";
import { LabelBadge, SeverityBadge } from "./badges";
import { Graph as GraphIcon, List as ListIcon } from "./icons";
import { Inline } from "./inline";

type Node = EvidenceGraph["nodes"][number];
type Edge = EvidenceGraph["edges"][number];
type Kind = Node["kind"];

export const COLUMNS: Kind[] = ["finding", "file", "commit", "dependency", "manifest"];
const KIND_TEXT: Record<Kind, { tag: string; name: string; plural: string }> = {
  finding: { tag: "FINDING", name: "Finding", plural: "Findings" }, file: { tag: "FILE", name: "File", plural: "Files" }, dependency: { tag: "DEPENDENCY", name: "Dependency", plural: "Dependencies" }, manifest: { tag: "MANIFEST", name: "Manifest", plural: "Manifests" }, commit: { tag: "COMMIT", name: "Commit", plural: "Commits" },
};
const EDGE_TEXT: Record<Edge["kind"], string> = {
  "located-in": "located in", imports: "imports", "declared-in": "declared in", duplicates: "also reported by", "missing-from": "missing from",
};
/** Edge kinds are told apart by dash pattern and weight, with a legend; colour only reinforces. */
const EDGE_STYLE: Record<Edge["kind"], { dash?: string; width: number; color: string }> = {
  "located-in": { width: 1.25, color: "var(--text-muted)" },
  imports: { width: 2, color: "var(--text)" },
  "declared-in": { width: 2, color: "var(--pass-fg)", dash: "1 0" },
  duplicates: { width: 1.5, color: "var(--text-muted)", dash: "1.5 3.5" },
  "missing-from": { width: 2, color: "var(--confirmed-solid)", dash: "7 4" },
};

/** Column widths by node kind: findings carry the longest labels. */
export const COL_W: Record<Kind, number> = { finding: 300, file: 190, commit: 130, dependency: 250, manifest: 170 };
export const NODE_H = 40, ROW_GAP = 10, COL_GAP = 36, PAD = 12, HEAD = 22, LINE_PX = 6.3, MAX_LINES = 2;

export function layoutGraph(g: EvidenceGraph) {
  const pos = new Map<string, { x: number; y: number; w: number }>();
  const used = COLUMNS.filter((k) => g.nodes.some((n) => n.kind === k));
  let x = PAD;
  const colX: Partial<Record<Kind, number>> = {};
  for (const k of used) {
    colX[k] = x;
    g.nodes.filter((n) => n.kind === k).forEach((n, ri) => pos.set(n.id, { x: x!, y: PAD + HEAD + ri * (NODE_H + ROW_GAP), w: COL_W[k] }));
    x += COL_W[k] + COL_GAP;
  }
  const rows = Math.max(1, ...used.map((k) => g.nodes.filter((n) => n.kind === k).length));
  return { pos, colX, columns: used, width: x - COL_GAP + PAD, height: PAD * 2 + HEAD + rows * (NODE_H + ROW_GAP) };
}

/**
 * Greedy word wrap into at most `maxLines` lines of `maxChars`. Over-long words are hard-broken.
 * Only text beyond the last line is dropped, and then the last line ends with an ellipsis.
 */
export function wrapLabel(text: string, maxChars: number, maxLines = MAX_LINES): string[] {
  const words = text.split(/\s+/).filter(Boolean).flatMap((w) => (w.length > maxChars ? w.match(new RegExp(`.{1,${maxChars}}`, "g")) ?? [w] : [w]));
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + "…";
  return kept;
}

const labelOf = (n: Node): { text: string; label?: Finding["label"] } => {
  const m = /^(.*) \[(confirmed|likely|speculative)\]$/.exec(n.label);
  return m ? { text: m[1]!.replace(/`/g, ""), label: m[2] as Finding["label"] } : { text: n.label.replace(/`/g, "") };
};
const STRIPE: Record<string, string> = { confirmed: "var(--confirmed-solid)", likely: "var(--likely-solid)", speculative: "var(--speculative-solid)" };

export function EvidenceGraphView({ graph, findings }: { graph: EvidenceGraph; findings: Finding[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [force, setForce] = useState<"graph" | "list" | null>(null);
  const L = useMemo(() => layoutGraph(graph), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const edgesOf = (id: string) => graph.edges.filter((e) => e.from === id || e.to === id);
  const connected = useMemo(() => {
    const s = new Set<string>();
    if (selected) { s.add(selected); for (const e of edgesOf(selected)) { s.add(e.from); s.add(e.to); } }
    return s;
  }, [selected, graph]); // eslint-disable-line react-hooks/exhaustive-deps

  if (graph.nodes.length === 0) return null;
  const sel = selected ? byId.get(selected) : null;
  const finding = sel?.kind === "finding" ? findings.find((f) => f.id === sel.id) : undefined;
  const pick = (id: string) => setSelected((cur) => (cur === id ? null : id));
  const onKey = (id: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(id); } };

  const graphCls = force === "list" ? "hidden" : force === "graph" ? "block" : "hidden md:block";
  const listCls = force === "list" ? "block" : force === "graph" ? "hidden" : "md:hidden";
  const seg = (active: boolean) => `inline-flex h-7 items-center gap-1 px-2 text-xs font-medium ${active ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-2"}`;

  const path = (e: Edge) => {
    const a = L.pos.get(e.from), b = L.pos.get(e.to);
    if (!a || !b) return null;
    const ay = a.y + NODE_H / 2, by = b.y + NODE_H / 2;
    if (a.x === b.x) { const x = a.x - 6; return `M${a.x},${ay} C${x - 24},${ay} ${x - 24},${by} ${b.x},${by}`; }
    const [x1, x2] = a.x < b.x ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
    const mx = (x1 + x2) / 2;
    return `M${x1},${ay} C${mx},${ay} ${mx},${by} ${x2},${by}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <div role="group" aria-label="Graph layout" className="hidden overflow-hidden rounded border border-line md:inline-flex">
          <button type="button" aria-pressed={force !== "list"} onClick={() => setForce("graph")} className={seg(force !== "list")}><GraphIcon width={14} height={14} />Graph</button>
          <button type="button" aria-pressed={force === "list"} onClick={() => setForce("list")} className={seg(force === "list")}><ListIcon width={14} height={14} />List</button>
        </div>
      </div>

      <div className={graphCls} data-testid="graph-canvas">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <svg role="group" aria-label="Evidence graph. Select a node to inspect it." viewBox={`0 0 ${L.width} ${L.height}`} width="100%" style={{ minWidth: Math.min(L.width, 720), height: "auto" }}>
            {L.columns.map((k) => <text key={k} x={L.colX[k]} y={PAD + 8} fontSize="10" fontWeight="600" letterSpacing="0.08em" fill="var(--text-muted)">{KIND_TEXT[k].plural.toUpperCase()}</text>)}
            {graph.edges.map((e, i) => {
              const d = path(e); if (!d) return null;
              const st = EDGE_STYLE[e.kind];
              const active = !selected || (connected.has(e.from) && connected.has(e.to) && (e.from === selected || e.to === selected));
              return <path key={i} d={d} fill="none" stroke={st.color} strokeWidth={active && selected ? st.width + 0.75 : st.width} strokeDasharray={st.dash} opacity={active ? 0.95 : 0.15} data-edge={e.kind} />;
            })}
            {graph.nodes.map((n) => {
              const p = L.pos.get(n.id); if (!p) return null;
              const { text, label } = labelOf(n);
              const lines = wrapLabel(text, Math.floor((p.w - 24) / LINE_PX));
              const isSel = n.id === selected, dim = !!selected && !connected.has(n.id);
              return (
                <g key={n.id} role="button" tabIndex={0} aria-pressed={isSel} aria-label={`${KIND_TEXT[n.kind].tag} ${text}`} data-testid="graph-node"
                  onClick={() => pick(n.id)} onKeyDown={onKey(n.id)} opacity={dim ? 0.35 : 1} style={{ cursor: "pointer" }}>
                  <rect x={p.x} y={p.y} width={p.w} height={NODE_H} rx={5} fill="var(--surface-2)" stroke={isSel ? "var(--focus)" : "var(--border)"} strokeWidth={isSel ? 2 : 1} />
                  {label && <rect x={p.x} y={p.y} width={4} height={NODE_H} rx={2} fill={STRIPE[label]} />}
                  <text x={p.x + 12} y={p.y + (lines.length === 1 ? NODE_H / 2 + 4 : 17)} fontSize="12" fill="var(--text)" data-testid="graph-node-text">
                    {lines.map((ln, i) => <tspan key={i} x={p.x + 12} dy={i === 0 ? 0 : 15}>{i < lines.length - 1 ? ln + " " : ln}</tspan>)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className={listCls} data-testid="graph-list">
        <div className="space-y-4">
          {COLUMNS.filter((k) => graph.nodes.some((n) => n.kind === k)).map((k) => (
            <section key={k} aria-label={KIND_TEXT[k].plural}>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{KIND_TEXT[k].plural}</h2>
              <ul className="list-none space-y-1 p-0">
                {graph.nodes.filter((n) => n.kind === k).map((n) => {
                  const { text, label } = labelOf(n);
                  return (
                    <li key={n.id}>
                      <button type="button" aria-pressed={n.id === selected} onClick={() => pick(n.id)}
                        className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm ${n.id === selected ? "border-focus bg-surface-2" : "border-line bg-surface hover:bg-surface-2"}`}>
                        {label && <LabelBadge label={label} />}
                        <span className="min-w-0 break-words">{text}</span>
                        <span className="num ml-auto shrink-0 text-xs text-muted">{edgesOf(n.id).length} links</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <aside aria-label="Node inspector" aria-live="polite" className="rounded-lg border border-line bg-surface p-4" data-testid="graph-inspector">
        {!sel ? (
          <p className="text-sm text-muted">Select a node to see what it connects to.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{KIND_TEXT[sel.kind].name}</div>
              <div className="break-words text-sm font-semibold"><Inline text={labelOf(sel).text} /></div>
            </div>
            {finding && (
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-3"><LabelBadge label={finding.label} /><SeverityBadge severity={finding.severity} /><span className="num font-mono text-xs text-muted">{finding.file}:{finding.line}</span></div>
                <p className="text-muted"><Inline text={finding.detail} /></p>
                {finding.evidence.length > 0 && <ul className="list-none space-y-0.5 border-l-2 border-line pl-3 font-mono text-xs">{finding.evidence.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>}
              </div>
            )}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Connections ({edgesOf(sel.id).length})</div>
              <ul className="list-none space-y-1 p-0 text-sm">
                {edgesOf(sel.id).map((e, i) => {
                  const otherId = e.from === sel.id ? e.to : e.from;
                  const other = byId.get(otherId);
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                      <span className="text-muted">{e.from === sel.id ? EDGE_TEXT[e.kind] : `${EDGE_TEXT[e.kind]} (incoming)`}</span>
                      {other ? <button type="button" onClick={() => setSelected(otherId)} className="break-all text-left font-mono text-xs text-link underline underline-offset-2">{labelOf(other).text}</button> : <span>{otherId}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Legend() {
  return (
    <ul aria-label="Legend" className="flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {(Object.keys(EDGE_STYLE) as Edge["kind"][]).filter((k) => k !== "declared-in").map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <svg width="28" height="8" aria-hidden><line x1="1" y1="4" x2="27" y2="4" stroke={EDGE_STYLE[k].color} strokeWidth={EDGE_STYLE[k].width} strokeDasharray={EDGE_STYLE[k].dash} /></svg>{EDGE_TEXT[k]}
        </li>
      ))}
      {(["confirmed", "likely", "speculative"] as const).map((l) => (
        <li key={l} className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-1 rounded-sm" style={{ background: STRIPE[l] }} />{l} finding</li>
      ))}
    </ul>
  );
}
