import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(__dirname, "..");
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: !!r.isError, text: r.content[0]!.text };
};

beforeAll(async () => {
  const transport = new StdioClientTransport({
    command: path.join(root, "node_modules/.bin/tsx"), args: ["src/mcp/server.ts"], cwd: root,
    env: { PATH: process.env.PATH ?? "", ASSAY_OFFLINE: "1" },
  });
  client = new Client({ name: "assay-test", version: "0.0.0" });
  await client.connect(transport);
}, 30000);
afterAll(async () => { await client?.close(); });

describe("assay MCP server over stdio", () => {
  it("identifies as 'assay' and lists the seven tools", async () => {
    expect(client.getServerVersion()?.name).toBe("assay");
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["assay_check_authorship", "assay_check_deps", "assay_eval", "assay_fix", "assay_handoff", "assay_review", "assay_score_patch"]);
  });

  it("assay_eval reports metrics and finds both phantom bugs", async () => {
    const r = JSON.parse((await call("assay_eval")).text);
    expect(r).toMatchObject({ recall: 1, precision: 1, criticalRecall: 1, gate: "pass" });
    expect(r.found).toEqual(expect.arrayContaining(["P1", "P2"]));
  });

  it("assay_review -> assay_fix -> assay_handoff / assay_score_patch flow", async () => {
    const review = JSON.parse((await call("assay_review", { source: "seeded" })).text);
    const p1 = review.findings.find((f: { specifier?: string }) => f.specifier === "express-validator-pro");
    expect(p1).toMatchObject({ label: "confirmed", registryStatus: "not-found" });
    const fix = JSON.parse((await call("assay_fix", { scanId: review.id, findingId: p1.id })).text);
    expect(fix.winner.gate.eligible).toBe(true);
    const handoff = (await call("assay_handoff", { scanId: review.id, findingId: p1.id })).text;
    expect(handoff).toContain("# Fix handoff");
    const bad = JSON.parse((await call("assay_score_patch", { scanId: review.id, findingId: p1.id, diff: "--- a/src/server.ts\n+++ b/src/server.ts\n@@ -1 +1 @@\n-nope\n+yes\n" })).text);
    expect(bad.total).toBe(0);
    expect(bad.gate.eligible).toBe(false);
  });

  it("assay_check_deps returns dependency issues", async () => {
    const r = JSON.parse((await call("assay_check_deps", { source: "seeded" })).text);
    expect(r.issues.map((i: { packageName: string }) => i.packageName).sort()).toEqual(["express-validator-pro", "fastjsonvalidate"]);
  });

  it("assay_check_authorship lists fixtures with eval metrics, returns a report and disclosure draft, and refuses scrub requests", async () => {
    const overview = JSON.parse((await call("assay_check_authorship", { source: "seeded" })).text);
    expect(overview.cases.length).toBeGreaterThanOrEqual(6);
    expect(overview.eval).toMatchObject({ gate: "pass", falsePositiveRate: 0 });
    const mismatch = JSON.parse((await call("assay_check_authorship", { source: "seeded", case: "claims-handwritten-has-claude" })).text);
    expect(mismatch.report.status).toBe("mismatch");
    expect(mismatch.report.signals.map((s: { ref: string }) => s.ref)).toEqual(expect.arrayContaining(["tool-file:CLAUDE.md", "readme:human"]));
    expect(mismatch.disclosure.markdown).toContain("## How this was built");
    expect(mismatch.report.caveats.join(" ")).toMatch(/never says who or what wrote/);
    const refused = await call("assay_check_authorship", { source: "seeded", case: "mixed", request: "remove the AI trailers from the commit history" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/will not remove, hide, rewrite or obfuscate/);
    const ok = await call("assay_check_authorship", { source: "seeded", case: "mixed", request: "help me disclose this accurately" });
    expect(ok.isError).toBe(false);
    expect((await call("assay_check_authorship", { source: "seeded", case: "nope" })).isError).toBe(true);
  });

  it("assay_eval also reports the authorship eval", async () => {
    const r = JSON.parse((await call("assay_eval")).text);
    expect(r.authorship).toMatchObject({ gate: "pass", precision: 1, recall: 1, falsePositiveRate: 0 });
  });

  it("returns tool errors (not crashes) for bad input", async () => {
    expect((await call("assay_fix", { findingId: "nope" })).isError).toBe(true);
    expect((await call("assay_review", { source: "path" })).isError).toBe(true);
  });

  it("exposes resources and prompts", async () => {
    const uris = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["assay://answer-key", "assay://evidence-graph", "assay://findings"]);
    const key = JSON.parse(((await client.readResource({ uri: "assay://answer-key" })).contents[0] as { text: string }).text);
    expect(key.bugs).toHaveLength(11);
    const findings = JSON.parse(((await client.readResource({ uri: "assay://findings" })).contents[0] as { text: string }).text);
    expect(findings.length).toBe(11);
    expect((await client.listPrompts()).prompts.map((p) => p.name).sort()).toEqual(["fix_handoff", "review"]);
    const p = await client.getPrompt({ name: "review", arguments: { target: "https://github.com/o/r" } });
    expect((p.messages[0]!.content as { text: string }).text).toContain("github_url=https://github.com/o/r");
  });
});
