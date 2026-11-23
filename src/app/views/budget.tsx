"use client";
import { BudgetPanel } from "../components/budget-panel";
import { ScanGate } from "../components/scan-gate";

export function BudgetView() {
  return <ScanGate loadingRows={1} loadingHeight={240}>{(scan) => <BudgetPanel telemetry={scan.telemetry} llm={scan.llm} />}</ScanGate>;
}
