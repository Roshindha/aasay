import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCheckEnv, ENV_ALLOWLIST, SECRET_NAME } from "@/gate/env";
import { runGate } from "@/gate/gate";
import { makeDiff } from "@/patches/generate";
import { runSeededEval } from "@/judge/eval";
import { runTournament } from "@/patches/tournament";
import { buildHandoff } from "@/patches/handoff";
import { scorePatch } from "@/patches/score";

const files = [{ path: "a.txt", content: "one\ntwo\nthree\n" }, { path: "cfg.json", content: `{"a":1}\n` }];

describe("gate: applying diffs in a temp dir", () => {
  it("accepts a diff that applies and returns patched contents; real files untouched", async () => {
    const diff = makeDiff("a.txt", files[0]!.content, "one\nTWO\nthree\n");
    const g = await runGate(files, diff);
    expect(g).toMatchObject({ applies: true, eligible: true });
    expect(g.patchedFiles.find((f) => f.path === "a.txt")!.content).toBe("one\nTWO\nthree\n");
    expect(files[0]!.content).toBe("one\ntwo\nthree\n");
  });

  it("marks a non-applying patch ineligible", async () => {
    const stale = makeDiff("a.txt", "one\nDIFFERENT\nthree\n", "one\nX\nthree\n");
    const g = await runGate(files, stale);
    expect(g.applies).toBe(false);
    expect(g.eligible).toBe(false);
    expect(g.reason).toMatch(/does not apply/);
  });

  it("rejects garbage, empty diffs, and path traversal without touching the filesystem", async () => {
    expect((await runGate(files, "not a diff")).eligible).toBe(false);
    expect((await runGate(files, "")).eligible).toBe(false);
    const evil = "--- a/../../etc/evil\n+++ b/../../etc/evil\n@@ -0,0 +1 @@\n+x\n";
    const g = await runGate(files, evil);
    expect(g.eligible).toBe(false);
    expect(g.reason).toMatch(/unsafe path/);
  });

  it("fails eligibility when a built-in check fails (invalid JSON after patch)", async () => {
    const g = await runGate(files, makeDiff("cfg.json", files[1]!.content, "{nope\n"));
    expect(g.applies).toBe(true);
    expect(g.eligible).toBe(false);
  });

  it("scorePatch gives a non-applying candidate zero on every axis", async () => {
    const f = { id: "x", lane: "hallucination", severity: "low", label: "likely", file: "a.txt", line: 1, title: "t", detail: "d", evidence: [], lanes: ["hallucination"] } as const;
    const s = await scorePatch({ ...f, lanes: [...f.lanes], evidence: [] }, { id: "c", findingId: "x", strategy: "conservative", summary: "s", diff: makeDiff("a.txt", "zzz\n", "yyy\n") }, files);
    expect(s.total).toBe(0);
    expect(s.gate.eligible).toBe(false);
    expect(Object.values(s.axes).every((v) => v === 0)).toBe(true);
  });
});

describe("gate: secrets never reach the check environment", () => {
  const SECRETS = {
    OPENAI_API_KEY: "sk-test-AAAA", GITHUB_TOKEN: "ghp_BBBB", AWS_SECRET_ACCESS_KEY: "CCCC", MY_SERVICE_PASSWORD: "DDDD",
    SESSION_COOKIE: "EEEE", DB_CREDENTIALS: "FFFF", ASSAY_MODEL_KEY_X: "GGGG",
  };
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const [k, v] of Object.entries(SECRETS)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterEach(() => { for (const k of Object.keys(SECRETS)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("buildCheckEnv keeps only allowlisted, non-secret names", () => {
    const env = buildCheckEnv({ ...process.env, PATH: "/bin", FOO: "bar" }, { MY_TOKEN: "x", OK_VAR: "1" });
    expect(Object.keys(env).sort()).toEqual(expect.arrayContaining(["PATH", "OK_VAR"]));
    expect(env).not.toHaveProperty("FOO");
    expect(Object.keys(env).filter((k) => SECRET_NAME.test(k))).toEqual([]);
    expect(Object.values(env).join("|")).not.toMatch(/sk-test|ghp_|AAAA|BBBB/);
    for (const k of Object.keys(env)) expect([...ENV_ALLOWLIST, "OK_VAR"]).toContain(k);
  });

  it("a real subprocess run by the gate cannot see secret-named variables", async () => {
    const diff = makeDiff("a.txt", files[0]!.content, "one\nTWO\nthree\n");
    const g = await runGate(files, diff, {
      parentEnv: process.env,
      checks: [{ name: "dump-env", cmd: process.execPath, args: ["-e", "console.log(JSON.stringify(process.env))"] }],
    });
    const dump = g.checks.find((c) => c.name === "dump-env")!;
    expect(dump.ok).toBe(true);
    const seen = JSON.parse(dump.output.trim().split("\n").pop()!) as Record<string, string>;
    expect(Object.keys(seen).filter((k) => SECRET_NAME.test(k))).toEqual([]);
    for (const secret of Object.values(SECRETS)) expect(dump.output).not.toContain(secret);
    expect(seen.HOME).not.toBe(process.env.HOME); // HOME is redirected into the temp dir
  });
});

describe("tournament on the seeded demo", () => {
  it("prefers replace+declare over bare removal for a phantom import and every winner clears the gate", async () => {
    const { review, files: demo } = await runSeededEval();
    const p1 = review.findings.find((f) => f.specifier === "express-validator-pro")!;
    const t = await runTournament(p1, demo);
    expect(t.winner?.candidate.summary).toMatch(/Replace .* and declare it in package\.json/);
    const removal = t.ranked.find((r) => /^Remove the import/.test(r.candidate.summary))!;
    expect(removal.axes.correctness).toBeLessThan(t.winner!.axes.correctness); // dangling `validateBody`
    expect(t.winner!.gate.eligible).toBe(true);
    expect(buildHandoff(t)).toContain("```diff");
  });

  it("every generated winner removes its own finding when applied", async () => {
    const { review, files: demo } = await runSeededEval();
    const { runReview } = await import("@/core/pipeline");
    let withWinner = 0;
    for (const f of review.findings) {
      const t = await runTournament(f, demo);
      if (!t.winner) continue;
      withWinner++;
      const g = await runGate(demo, t.winner.candidate.diff);
      const after = await runReview({ files: g.patchedFiles, registryMode: "offline" });
      expect(after.findings.some((x) => x.lane === f.lane && x.file === f.file && (x.specifier ?? x.title) === (f.specifier ?? f.title))).toBe(false);
    }
    expect(withWinner).toBeGreaterThanOrEqual(9);
  });

  it("produces no candidates for findings that need human judgement", async () => {
    const { review, files: demo } = await runSeededEval();
    const noAssert = review.findings.find((f) => f.title.includes("makes no assertions"))!;
    expect((await runTournament(noAssert, demo)).winner).toBeNull();
  });
});
