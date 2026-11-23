import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  answerKeyJson, getScan, scanGithub, scanLocal, scanSeeded, scanView, scoreCustomPatch, tournamentFor, type Scan,
} from "@/core/service";
import { runSeededEval } from "@/judge/eval";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (e as Error).message }] });

const SourceShape = {
  source: z.enum(["seeded", "path", "github"]).default("seeded").describe("seeded = bundled demo; path = local directory; github = repo or PR URL"),
  path: z.string().optional().describe("Directory to review when source=path"),
  github_url: z.string().optional().describe("https://github.com/<owner>/<repo>[/pull/<n>] when source=github"),
  offline: z.boolean().optional().describe("Skip registry lookups (unknown registry status is then only speculative)"),
};

async function resolveScan(a: { source?: "seeded" | "path" | "github"; path?: string; github_url?: string; offline?: boolean; scanId?: string }): Promise<Scan> {
  if (a.scanId) return getScan(a.scanId);
  const source = a.source ?? "seeded";
  if (source === "path") { if (!a.path) throw new Error("path is required when source=path"); return scanLocal(a.path, { offline: a.offline }); }
  if (source === "github") { if (!a.github_url) throw new Error("github_url is required when source=github"); return scanGithub(a.github_url, { offline: a.offline }); }
  return scanSeeded();
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "assay", version: "0.1.0" });

  server.registerTool("assay_review", {
    description: "Review code for hallucinated APIs, spec drift, test theater and phantom dependencies. Returns a scanId plus verdicts (confirmed/likely/speculative).",
    inputSchema: SourceShape,
  }, async (a) => { try { return text(scanView(await resolveScan(a))); } catch (e) { return fail(e); } });

  server.registerTool("assay_fix", {
    description: "Run the patch tournament for one finding: candidates are gated (applied in a temp dir) and scored on five axes.",
    inputSchema: { scanId: z.string().optional(), findingId: z.string() },
  }, async (a) => {
    try { const t = await tournamentFor(a.scanId, a.findingId); return text({ scanId: t.scanId, winner: t.winner, ranked: t.ranked }); } catch (e) { return fail(e); }
  });

  server.registerTool("assay_score_patch", {
    description: "Gate and score a caller-supplied unified diff against a finding. A diff that does not apply is ineligible (score 0).",
    inputSchema: { scanId: z.string().optional(), findingId: z.string(), diff: z.string().describe("Unified diff with a/ b/ prefixed paths") },
  }, async (a) => { try { return text(await scoreCustomPatch(a.scanId, a.findingId, a.diff)); } catch (e) { return fail(e); } });

  server.registerTool("assay_handoff", {
    description: "Markdown brief for another agent or human: finding, evidence, recommended patch, gate results, verification steps.",
    inputSchema: { scanId: z.string().optional(), findingId: z.string() },
  }, async (a) => { try { return text((await tournamentFor(a.scanId, a.findingId)).handoff); } catch (e) { return fail(e); } });

  server.registerTool("assay_eval", {
    description: "Run the seeded benchmark offline and report recall, precision, critical recall and gate status. Self-authored: measures plumbing, not real-world accuracy.",
    inputSchema: {},
  }, async () => { try { const { result } = await runSeededEval(); return text(result); } catch (e) { return fail(e); } });

  server.registerTool("assay_check_deps", {
    description: "Phantom-dependency check only: imports vs manifests/lockfiles vs registry (npm, PyPI), plus typosquat hints.",
    inputSchema: { ...SourceShape, scanId: z.string().optional() },
  }, async (a) => {
    try {
      const v = scanView(await resolveScan(a));
      return text({ scanId: v.id, ...v.dependencies, findings: v.findings.filter((f) => f.lane === "phantom-dependency") });
    } catch (e) { return fail(e); }
  });

  const json = (uri: string, v: unknown) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v, null, 2) }] });
  server.registerResource("findings", "assay://findings", { description: "Findings of the most recent scan", mimeType: "application/json" },
    async (u) => json(u.href, getScan().review.findings));
  server.registerResource("evidence-graph", "assay://evidence-graph", { description: "Evidence graph of the most recent scan", mimeType: "application/json" },
    async (u) => json(u.href, getScan().review.graph));
  server.registerResource("answer-key", "assay://answer-key", { description: "Planted bugs for the seeded demo", mimeType: "application/json" },
    async (u) => json(u.href, answerKeyJson()));

  server.registerPrompt("review", {
    description: "Ask the model to review a target with Assay and summarize verdicts",
    argsSchema: { target: z.string().describe("Local path or GitHub URL") },
  }, ({ target }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Use assay_review on ${/^https:\/\/github\.com\//.test(target) ? `github_url=${target} (source=github)` : `path=${target} (source=path)`}. Report confirmed findings first, then likely; mention speculative ones only briefly. For phantom dependencies, say which registry returned 404 and which manifest lacks the package.` } }],
  }));
  server.registerPrompt("fix_handoff", {
    description: "Produce a fix handoff for one finding",
    argsSchema: { findingId: z.string(), scanId: z.string().optional() },
  }, ({ findingId, scanId }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Call assay_handoff with findingId=${findingId}${scanId ? ` scanId=${scanId}` : ""}, then apply the recommended diff, and re-run assay_review to confirm the finding is gone and nothing new of medium severity or higher appeared.` } }],
  }));

  return server;
}

// Start on stdio only when executed directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}
