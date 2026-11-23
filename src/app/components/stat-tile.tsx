import type { ReactNode } from "react";

export function StatTile({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "neutral" | "pass" | "fail" }) {
  const border = tone === "pass" ? "border-pass/50" : tone === "fail" ? "border-confirmed/60" : "border-line";
  return (
    <div data-testid="stat-tile" className={`flex min-h-[88px] flex-col justify-between rounded-lg border ${border} bg-surface p-3`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="m-0">
        <div className="num text-[28px] font-semibold leading-8">{value}</div>
        {hint && <div className="num mt-0.5 text-xs text-muted">{hint}</div>}
      </dd>
    </div>
  );
}
