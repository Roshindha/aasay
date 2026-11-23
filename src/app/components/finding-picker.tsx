"use client";
import { useId } from "react";
import type { Finding } from "@/core/types";

export function FindingPicker({ findings, value, onChange }: { findings: Finding[]; value: string | null; onChange: (id: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">Finding</label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded border border-line bg-surface px-2 text-sm">
        {findings.map((f) => <option key={f.id} value={f.id}>{`[${f.label}] ${f.title.replace(/`/g, "")} — ${f.file}:${f.line}`}</option>)}
      </select>
    </div>
  );
}
