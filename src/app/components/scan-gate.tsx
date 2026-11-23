"use client";
import type { ReactNode } from "react";
import type { ScanView } from "@/core/service";
import { useApp } from "../state";
import { useView } from "../use-view";
import { EmptyState, ErrorState, LoadingState } from "./states";

/** Shared loading / error / empty handling for every view that needs a scan. */
export function ScanGate({ children, loadingRows = 4, loadingHeight = 96 }: { children: (scan: ScanView) => ReactNode; loadingRows?: number; loadingHeight?: number }) {
  const { scan, source, loadSeeded } = useApp();
  const [, go] = useView();
  if (scan.status === "loading" && !scan.data) return <LoadingState label="Loading scan" rows={loadingRows} rowHeight={loadingHeight} />;
  if (scan.status === "error" && !scan.data) {
    return <ErrorState title={source === "live" ? "Live scan failed" : "Seeded run failed"} message={scan.error ?? "Unknown error"} onRetry={source === "seeded" ? loadSeeded : () => go("live")} />;
  }
  if (!scan.data) {
    return (
      <EmptyState title="No scan to show"
        action={<button type="button" onClick={() => go("live")} className="h-8 rounded border border-line bg-surface px-3 text-xs font-medium hover:bg-surface-2">Go to Live scan</button>}>
        Run a live scan first, or switch the source to Seeded.
      </EmptyState>
    );
  }
  return <>{children(scan.data)}</>;
}
