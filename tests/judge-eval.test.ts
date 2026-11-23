import { describe, expect, it } from "vitest";
import { judge } from "@/judge/judge";
import { loadAnswerKey, runSeededEval, scoreAgainstKey } from "@/judge/eval";
import { FindingSchema } from "@/core/types";
import { buildTelemetry } from "@/core/files";

const mk = (o: Record<string, unknown>) => FindingSchema.parse({ id: "x", lane: "hallucination", severity: "low", label: "likely", file: "a.ts", line: 1, title: "t", detail: "d", ...o });

describe("judge", () => {
  it("dedupes same file/line/title, merges lanes, upgrades likely->confirmed on agreement", () => {
    const out = judge([mk({ id: "1" }), mk({ id: "2", lane: "phantom-dependency", severity: "high" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "high", label: "confirmed" });
    expect(out[0]!.lanes.sort()).toEqual(["hallucination", "phantom-dependency"]);
  });
  it("never upgrades a lone speculative finding and keeps distinct findings apart", () => {
    const out = judge([mk({ label: "speculative" }), mk({ id: "y", line: 2, title: "other" })]);
    expect(out).toHaveLength(2);
    expect(out.find((f) => f.line === 1)!.label).toBe("speculative");
  });
  it("dedupes by specifier when present", () => {
    expect(judge([mk({ specifier: "p", title: "A" }), mk({ specifier: "p", title: "B" })])).toHaveLength(1);
  });
});

describe("seeded eval", () => {
  it("finds every planted bug, including both phantom dependencies, and passes the gate", async () => {
    const { result, review } = await runSeededEval();
    expect(result.missed).toEqual([]);
    expect(result.found).toEqual(expect.arrayContaining(["P1", "P2"]));
    expect(result.recall).toBe(1);
    expect(result.criticalRecall).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.gate).toBe("pass");
    const phantom = review.findings.filter((x) => x.lane === "phantom-dependency");
    expect(phantom.map((p) => [p.specifier, p.registryStatus, p.label])).toEqual(
      expect.arrayContaining([["fastjsonvalidate", "not-found", "confirmed"], ["express-validator-pro", "not-found", "confirmed"]]),
    );
  });
  it("gate fails when a critical bug is missed or noise is added", () => {
    const key = loadAnswerKey();
    expect(scoreAgainstKey([], key)).toMatchObject({ recall: 0, gate: "fail" });
    const noisy = scoreAgainstKey([mk({ file: "zzz.ts", line: 99 })], key);
    expect(noisy.precision).toBe(0);
    expect(noisy.falsePositives).toHaveLength(1);
  });
  it("builds an evidence graph linking phantom findings to files, dependency and manifests", async () => {
    const { review } = await runSeededEval();
    const g = review.graph;
    expect(g.nodes.some((n) => n.kind === "dependency" && n.label.startsWith("express-validator-pro"))).toBe(true);
    expect(g.edges.some((e) => e.kind === "missing-from" && e.to === "manifest:package.json")).toBe(true);
    expect(g.edges.some((e) => e.kind === "imports" && e.from === "file:src/server.ts")).toBe(true);
  });
  it("reports context-budget telemetry (chars/4, cache keys)", async () => {
    const { review, files } = await runSeededEval();
    const t = buildTelemetry(files);
    expect(t.inspectedFiles).toHaveLength(files.length);
    expect(t.inspectedFiles[0]!.estTokens).toBe(Math.ceil(t.inspectedFiles[0]!.chars / 4));
    expect(review.telemetry.cacheKeys.some((k) => k.startsWith("registry:npm:express-validator-pro"))).toBe(true);
    expect(review.telemetry.cacheKeys.some((k) => /^file:src\/server\.ts@[0-9a-f]{12}$/.test(k))).toBe(true);
  });
});
