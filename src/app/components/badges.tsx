import type { ReactNode } from "react";
import type { Label, Severity } from "@/core/types";
import { CheckCircle, DashedCircle, HalfCircle, SeverityMeter, XCircle } from "./icons";

const LABEL: Record<Label, { text: string; cls: string; Icon: typeof CheckCircle }> = {
  confirmed: { text: "Confirmed", cls: "bg-confirmed-bg text-confirmed", Icon: CheckCircle },
  likely: { text: "Likely", cls: "bg-likely-bg text-likely", Icon: HalfCircle },
  speculative: { text: "Speculative", cls: "bg-speculative-bg text-speculative", Icon: DashedCircle },
};

/** Icon shape + text: the label is never conveyed by colour alone. */
export function LabelBadge({ label }: { label: Label }) {
  const { text, cls, Icon } = LABEL[label];
  return (
    <span data-testid="label-badge" data-label={label} className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs font-medium ${cls}`}>
      <Icon width={12} height={12} />{text}
    </span>
  );
}

const SEV: Record<Severity, { text: string; level: 1 | 2 | 3 | 4 }> = {
  critical: { text: "Critical", level: 4 }, high: { text: "High", level: 3 }, medium: { text: "Medium", level: 2 }, low: { text: "Low", level: 1 },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { text, level } = SEV[severity];
  return (
    <span data-testid="severity-badge" data-severity={severity} className="inline-flex h-5 items-center gap-1 text-xs font-medium text-fg">
      <SeverityMeter level={level} />{text}
    </span>
  );
}

export function StatusPill({ status, children }: { status: "pass" | "fail" | "neutral"; children: ReactNode }) {
  const cls = status === "pass" ? "bg-pass-bg text-pass" : status === "fail" ? "bg-confirmed-bg text-confirmed" : "bg-speculative-bg text-speculative";
  return (
    <span data-testid="status-pill" data-status={status} className={`inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-semibold ${cls}`}>
      {status === "pass" && <CheckCircle width={14} height={14} />}
      {status === "fail" && <XCircle width={14} height={14} />}
      {children}
    </span>
  );
}

export function LaneTag({ lane }: { lane: string }) {
  return <span className="inline-flex h-5 items-center rounded border border-line px-1.5 font-mono text-xs text-muted">{lane}</span>;
}
