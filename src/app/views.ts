export type ViewId = "seeded" | "live" | "verdicts" | "graph" | "deps" | "budget" | "tournament" | "handoffs";

export interface ViewMeta { id: ViewId; label: string; group: "Run" | "Analyze" | "Fix"; title: string; blurb: string }

export const VIEWS: ViewMeta[] = [
  { id: "seeded", label: "Seeded runs", group: "Run", title: "Seeded run", blurb: "Review the bundled demo repo offline and score it against its answer key." },
  { id: "live", label: "Live scan", group: "Run", title: "Live scan", blurb: "Review a GitHub repository or pull request." },
  { id: "verdicts", label: "Verdicts", group: "Analyze", title: "Verdicts", blurb: "Every finding with its confidence label, severity, location and evidence." },
  { id: "graph", label: "Evidence graph", group: "Analyze", title: "Evidence graph", blurb: "How findings, files, dependencies and manifests connect." },
  { id: "deps", label: "Dependencies", group: "Analyze", title: "Dependencies", blurb: "Imports checked against manifests, lockfiles and the package registries." },
  { id: "budget", label: "Context budget", group: "Analyze", title: "Context budget", blurb: "What was inspected, and its estimated token cost." },
  { id: "tournament", label: "Tournament", group: "Fix", title: "Patch tournament", blurb: "Candidate fixes, gated in a temp directory and scored on five axes." },
  { id: "handoffs", label: "Handoffs", group: "Fix", title: "Handoff", blurb: "A self-contained brief for another agent or person." },
];

export const DEFAULT_VIEW: ViewId = "seeded";
export const isViewId = (s: string): s is ViewId => VIEWS.some((v) => v.id === s);
