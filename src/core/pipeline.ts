import { buildEvidenceGraph } from "@/graph/evidence";
import { judge } from "@/judge/judge";
import { hallucinationLane } from "@/lanes/hallucination";
import { phantomLane } from "@/lanes/phantom";
import { specDriftLane } from "@/lanes/spec-drift";
import { testTheaterLane } from "@/lanes/test-theater";
import type { LaneContext } from "@/lanes/common";
import { analyzeDependencies, type DepReport } from "@/deps/resolver";
import { RegistryClient, type RegistryMode } from "@/deps/registry";
import { buildTelemetry } from "./files";
import { HeuristicLlmClient, type LlmClient } from "./llm";
import type { EvidenceGraph, Finding, Lane, SourceFile, Telemetry } from "./types";

export interface ReviewOptions {
  files: SourceFile[];
  registryMode?: RegistryMode;
  llm?: LlmClient;
  registry?: RegistryClient;
}

export interface ReviewResult {
  raw: Finding[];
  findings: Finding[];
  graph: EvidenceGraph;
  deps: DepReport;
  telemetry: Telemetry;
  llm: string;
}

const LANES: Array<[Lane, (c: LaneContext) => Finding[]]> = [
  ["hallucination", hallucinationLane],
  ["spec-drift", specDriftLane],
  ["test-theater", testTheaterLane],
  ["phantom-dependency", phantomLane],
];

export async function runReview(opts: ReviewOptions): Promise<ReviewResult> {
  const llm = opts.llm ?? new HeuristicLlmClient();
  const client = opts.registry ?? new RegistryClient({ mode: opts.registryMode ?? "offline" });
  const deps = await analyzeDependencies(opts.files, client);
  const ctx: LaneContext = { files: opts.files, deps };
  const raw: Finding[] = [];
  for (const [, run] of LANES) raw.push(...run(ctx));
  // optional model-proposed findings (heuristic client returns none); always "speculative"
  for (const [lane] of LANES) for (const f of opts.files) raw.push(...(await llm.reviewFile(lane, f)));
  const findings = judge(raw);
  return {
    raw, findings, deps, llm: llm.name,
    graph: buildEvidenceGraph(findings, deps),
    telemetry: buildTelemetry(opts.files, deps.registryKeysConsulted.map((k) => `registry:${k}`)),
  };
}
