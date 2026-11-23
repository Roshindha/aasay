"use client";
import type { EvidenceGraph } from "@/core/types";

const COLS = ["finding", "file", "dependency", "manifest"] as const;
const COLOR: Record<string, string> = { finding: "#f87171", file: "#60a5fa", dependency: "#fbbf24", manifest: "#34d399" };

export function GraphView({ graph }: { graph: EvidenceGraph }) {
  const byKind = Object.fromEntries(COLS.map((k) => [k, graph.nodes.filter((n) => n.kind === k)]));
  const W = 1000, rowH = 34, colX = (i: number) => 20 + i * 250;
  const H = Math.max(120, Math.max(...COLS.map((k) => byKind[k]!.length)) * rowH + 40);
  const pos = new Map<string, { x: number; y: number }>();
  COLS.forEach((k, ci) => byKind[k]!.forEach((n, ri) => pos.set(n.id, { x: colX(ci), y: 30 + ri * rowH })));
  return (
    <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2">
      <svg width={W} height={H} role="img" aria-label="Evidence graph">
        {COLS.map((k, i) => <text key={k} x={colX(i)} y={14} fill="#a1a1aa" fontSize="11">{k.toUpperCase()}</text>)}
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          return <line key={i} x1={a.x + 220} y1={a.y - 4} x2={b.x} y2={b.y - 4} stroke={e.kind === "missing-from" ? "#f87171" : "#52525b"} strokeDasharray={e.kind === "missing-from" ? "4 3" : undefined} />;
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y - 16} width={220} height={24} rx={4} fill="#18181b" stroke={COLOR[n.kind]} />
              <text x={p.x + 6} y={p.y} fill="#e4e4e7" fontSize="11">{n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-zinc-500">Dashed red edges: dependency missing from that manifest.</p>
    </div>
  );
}
