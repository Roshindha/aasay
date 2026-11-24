import type { ReactNode } from "react";
import type { DisclosureStatus, Overall, Strength } from "@/authorship/types";
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


const STRENGTH: Record<Strength, { text: string; cls: string; Icon: typeof CheckCircle }> = {
  strong: { text: "Strong", cls: "bg-confirmed-bg text-confirmed", Icon: CheckCircle },
  moderate: { text: "Moderate", cls: "bg-likely-bg text-likely", Icon: HalfCircle },
  speculative: { text: "Speculative", cls: "bg-speculative-bg text-speculative", Icon: DashedCircle },
};

/** Signal strength: icon shape plus text. */
export function StrengthBadge({ strength }: { strength: Strength }) {
  const { text, cls, Icon } = STRENGTH[strength];
  return <span data-testid="strength-badge" data-strength={strength} className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs font-medium ${cls}`}><Icon width={12} height={12} />{text}</span>;
}

const DISCLOSURE: Record<DisclosureStatus, { text: string; status: "pass" | "fail" | "neutral" }> = {
  disclosed: { text: "Disclosed", status: "pass" }, undisclosed: { text: "Undisclosed", status: "fail" },
  mismatch: { text: "Mismatch", status: "fail" }, "none-found": { text: "None found", status: "neutral" },
};
export function DisclosureBadge({ status }: { status: DisclosureStatus }) {
  const { text, status: tone } = DISCLOSURE[status];
  return <span data-testid="disclosure-status" data-status={status}><StatusPill status={tone}>{text}</StatusPill></span>;
}

const OVERALL: Record<Overall, { text: string; status: "pass" | "fail" | "neutral" }> = {
  clear: { text: "Clear", status: "pass" }, "needs-review": { text: "Needs review", status: "neutral" }, "action-needed": { text: "Action needed", status: "fail" },
};
export function OverallBadge({ overall }: { overall: Overall }) {
  const { text, status } = OVERALL[overall];
  return <span data-testid="overall-result" data-overall={overall}><StatusPill status={status}>{text}</StatusPill></span>;
}
