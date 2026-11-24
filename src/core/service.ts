import crypto from "node:crypto";
import path from "node:path";
import type { FetchLike } from "./allowlist";
import { fetchGithub, parseGithubUrl } from "@/github/fetch";
import { loadAnswerKey, runSeededEval } from "@/judge/eval";
import { buildHandoff } from "@/patches/handoff";
import { scorePatch } from "@/patches/score";
import { runTournament, type TournamentResult } from "@/patches/tournament";
import { RegistryClient } from "@/deps/registry";
import { fixturesDir } from "@/deps/popular";
import { readLocalCommits } from "@/authorship/git-local";
import { contentKey, listPaths, loadDir } from "./files";
import { createLlm } from "./llm";
import { runReview, type ReviewResult } from "./pipeline";
import type { EvalResult, PatchCandidate, ScoredPatch, SourceFile } from "./types";

export type ScanSource = "seeded" | "local" | "github";

export interface Scan {
  id: string;
  source: ScanSource;
  label: string;
  files: SourceFile[];
  review: ReviewResult;
  /** Present only for seeded scans: metrics against the answer key. Never computed for live/local scans. */
  eval?: EvalResult;
  /** True when no registry lookup went to the network: ASSAY_OFFLINE / offline option, or every answer came from fixtures or cache */
  offline: boolean;
  notes: string[];
}

const MAX_SCANS = 8;
const g = globalThis as unknown as { __assayScans?: Map<string, Scan> };
const scans = (g.__assayScans ??= new Map<string, Scan>());

export function putScan(s: Scan): Scan {
  scans.delete(s.id);
  scans.set(s.id, s);
  while (scans.size > MAX_SCANS) scans.delete(scans.keys().next().value!);
  return s;
}
export function getScan(id?: string): Scan {
  const s = id ? scans.get(id) : [...scans.values()].at(-1);
  if (!s) throw new Error(id ? `Unknown scanId ${id}. Run assay_review first.` : "No scans yet. Run assay_review first.");
  return s;
}

const scanId = (files: SourceFile[], tag: string) =>
  `${tag}-${crypto.createHash("sha1").update(files.map(contentKey).join("|")).digest("hex").slice(0, 10)}`;

export async function scanSeeded(): Promise<Scan> {
  const { review, result, files } = await runSeededEval();
  return putScan({ id: scanId(files, "seeded"), source: "seeded", label: "fixtures/seeded-demo (offline, self-authored benchmark)", files, review, eval: result, offline: true, notes: ["Registry answers come from recorded fixtures; no network used."] });
}

export interface ScanOptions { offline?: boolean; /** injectable transport for registry lookups (tests) */ registryFetch?: FetchLike }

function client(opts: ScanOptions) {
  return new RegistryClient({ mode: opts.offline || process.env.ASSAY_OFFLINE === "1" ? "offline" : "online", fetchImpl: opts.registryFetch });
}
const usedNoNetwork = (c: RegistryClient) => c.mode === "offline" || c.networkCalls === 0;

export async function scanLocal(dir: string, opts: ScanOptions = {}): Promise<Scan> {
  const root = path.resolve(dir);
  const files = loadDir(root);
  if (!files.length) throw new Error(`No reviewable files found under ${root}`);
  const reg = client(opts);
  const review = await runReview({ files, registry: reg, llm: createLlm(), repo: { paths: listPaths(root), commits: readLocalCommits(root) } });
  return putScan({ id: scanId(files, "local"), source: "local", label: root, files, review, offline: usedNoNetwork(reg), notes: [`${files.length} files inspected`] });
}

export async function scanGithub(url: string, opts: ScanOptions & { fetchImpl?: FetchLike } = {}): Promise<Scan> {
  const ref = parseGithubUrl(url);
  const fetched = await fetchGithub(ref, { token: process.env.GITHUB_TOKEN || undefined, fetchImpl: opts.fetchImpl });
  if (!fetched.files.length) throw new Error("No reviewable files were fetched from that URL.");
  const reg = client(opts);
  const review = await runReview({ files: fetched.files, registry: reg, llm: createLlm(), repo: { paths: fetched.paths, commits: fetched.commits ?? [] } });
  const notes = [`ref ${fetched.ref.slice(0, 10)}`, `${fetched.files.length} files fetched`];
  if (fetched.truncated) notes.push("truncated by file cap");
  if (fetched.skipped.length) notes.push(`${fetched.skipped.length} skipped (size/cap)`);
  if (ref.pull) notes.push(`PR #${ref.pull}: ${fetched.changed?.length ?? 0} changed files; manifests included for context`);
  return putScan({ id: scanId(fetched.files, "github"), source: "github", label: url, files: fetched.files, review, offline: usedNoNetwork(reg), notes });
}

export async function tournamentFor(scanIdValue: string | undefined, findingId: string): Promise<TournamentResult & { scanId: string; handoff: string }> {
  const scan = getScan(scanIdValue);
  const finding = scan.review.findings.find((f) => f.id === findingId);
  if (!finding) throw new Error(`Unknown findingId ${findingId} in scan ${scan.id}`);
  const t = await runTournament(finding, scan.files);
  return { ...t, scanId: scan.id, handoff: buildHandoff(t) };
}

export async function scoreCustomPatch(scanIdValue: string | undefined, findingId: string, diff: string): Promise<ScoredPatch> {
  const scan = getScan(scanIdValue);
  const finding = scan.review.findings.find((f) => f.id === findingId);
  if (!finding) throw new Error(`Unknown findingId ${findingId} in scan ${scan.id}`);
  const candidate: PatchCandidate = { id: `custom:${findingId}`, findingId, strategy: "idiomatic", summary: "Caller-supplied patch", diff };
  return scorePatch(finding, candidate, scan.files);
}

/** JSON-safe view of a scan for the UI and MCP. */
export function scanView(s: Scan) {
  const d = s.review.deps;
  return {
    id: s.id, source: s.source, label: s.label, notes: s.notes, llm: s.review.llm, offline: s.offline,
    findings: s.review.findings, graph: s.review.graph, telemetry: s.review.telemetry,
    eval: s.eval ?? null,
    authorship: { report: s.review.authorship, disclosure: s.review.disclosure },
    summary: {
      total: s.review.findings.length,
      byLabel: countBy(s.review.findings.map((f) => f.label)),
      byLane: countBy(s.review.findings.map((f) => f.lane)),
      bySeverity: countBy(s.review.findings.map((f) => f.severity)),
    },
    dependencies: {
      manifests: d.declared.manifests,
      warnings: d.declared.warnings,
      customRegistry: { npm: d.declared.customRegistry.npm, pypi: d.declared.customRegistry.pypi, npmScopes: [...d.declared.customRegistry.npmScopes] },
      declared: { npm: d.declared.npmDirect.size, pypi: d.declared.pyDirect.size },
      importCounts: countBy(d.imports.map((i) => i.cls)),
      issues: d.issues,
      popularSnapshot: d.popularSnapshot,
    },
  };
}
export type ScanView = ReturnType<typeof scanView>;

function countBy(xs: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
}

export function answerKeyJson() { return loadAnswerKey(fixturesDir()); }
