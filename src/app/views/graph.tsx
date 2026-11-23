"use client";
import { EvidenceGraphView } from "../components/evidence-graph";
import { ScanGate } from "../components/scan-gate";
import { EmptyState } from "../components/states";

export function GraphView() {
  return (
    <ScanGate loadingRows={2} loadingHeight={220}>
      {(scan) => scan.graph.nodes.length === 0
        ? <EmptyState title="Nothing to graph">This scan produced no findings, so there is no evidence to connect.</EmptyState>
        : <EvidenceGraphView graph={scan.graph} findings={scan.findings} />}
    </ScanGate>
  );
}
