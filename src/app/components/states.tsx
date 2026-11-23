import type { ReactNode } from "react";
import { Alert, Info } from "./icons";

/** Remove anything that looks like a credential before showing an error to the user. */
export function redactSecrets(message: string): string {
  return message
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{10,}/g, "[redacted]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]")
    .replace(/([?&](?:access_token|token|key|api_key|apikey)=)[^&\s]+/gi, "$1[redacted]");
}

export function LoadingState({ label = "Loading", rows = 3, rowHeight = 72 }: { label?: string; rows?: number; rowHeight?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="loading-state" className="space-y-2">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: rowHeight }} />)}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line bg-surface p-6">
      <div className="flex items-center gap-2 text-sm font-semibold"><Info width={16} height={16} className="text-muted" />{title}</div>
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" data-testid="error-state" className="flex flex-col items-start gap-2 rounded-lg border border-confirmed/60 bg-confirmed-bg p-4 text-confirmed">
      <div className="flex items-center gap-2 text-sm font-semibold"><Alert width={16} height={16} />{title}</div>
      <p className="max-w-prose break-words text-sm">{redactSecrets(message)}</p>
      {onRetry && <button type="button" onClick={onRetry} className="h-7 rounded border border-current px-2 text-xs font-medium hover:bg-surface/30">Try again</button>}
    </div>
  );
}
