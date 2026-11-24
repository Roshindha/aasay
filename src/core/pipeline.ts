import { buildReport } from "@/authorship/status";
import { draftDisclosure, type DisclosureDraft } from "@/authorship/disclosure";
import type { AuthorshipReport, CommitInfo } from "@/authorship/types";
import { authorshipLane } from "@/lanes/authorship";
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
  /** Full file listing (incl. hidden folders) and commit history for the authorship lane; defaults to the reviewed files and no commits */
  repo?: { paths: string[]; commits: CommitInfo[] };
}

export interface ReviewResult {
  raw: Finding[];
  findings: Finding[];
  graph: EvidenceGraph;
  deps: DepReport;
  telemetry: Telemetry;
  llm: string;
  authorship: AuthorshipReport;
  disclosure: DisclosureDraft;
}

const LANES: Array<[Lane, (c: LaneContext) => Finding[]]> = [
  ["hallucination", hallucinationLane],
  ["spec-drift", specDriftLane],
  ["test-theater", testTheaterLane],
  ["phantom-dependency", phantomLane],
  ["authorship", authorshipLane],
];

export async function runReview(opts: ReviewOptions): Promise<ReviewResult> {
  const llm = opts.llm ?? new HeuristicLlmClient();
  const client = opts.registry ?? new RegistryClient({ mode: opts.registryMode ?? "offline" });
  const deps = await analyzeDependencies(opts.files, client);
  const authorship = buildReport({ paths: opts.repo?.paths ?? opts.files.map((f) => f.path), files: opts.files, commits: opts.repo?.commits ?? [] });
  const ctx: LaneContext = { files: opts.files, deps, authorship };
  const raw: Finding[] = [];
  for (const [, run] of LANES) raw.push(...run(ctx));
  // optional model-proposed findings (heuristic client returns none); always "speculative"
  for (const [lane] of LANES) for (const f of opts.files) raw.push(...(await llm.reviewFile(lane, f)));
  const findings = judge(raw);
  return {
    raw, findings, deps, llm: llm.name, authorship, disclosure: draftDisclosure(authorship),
    graph: buildEvidenceGraph(findings, deps),
    telemetry: buildTelemetry(opts.files, deps.registryKeysConsulted.map((k) => `registry:${k}`)),
  };
}
