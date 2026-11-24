import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as authorshipRoute } from "@/app/api/authorship/route";
import { listAuthorshipCases, caseInput } from "@/authorship/eval";
import { readLocalCommits, parseGitLog } from "@/authorship/git-local";
import { runReview } from "@/core/pipeline";
import { scanLocal, scanSeeded, scanView, tournamentFor } from "@/core/service";
import { generateCandidates } from "@/patches/generate";

const get = (qs = "") => authorshipRoute(new Request(`http://x/api/authorship${qs}`));

describe("authorship as the fifth lane", () => {
  it("seeded demo yields no authorship findings and the bug eval is unchanged", async () => {
    const scan = await scanSeeded();
    expect(scan.review.findings.some((f) => f.lane === "authorship")).toBe(false);
    expect(scan.eval).toMatchObject({ recall: 1, precision: 1, gate: "pass" });
    expect(scanView(scan).authorship.report.status).toBe("none-found");
  });

  it("feeds findings, the evidence graph and the handoff like the other lanes", async () => {
    const c = listAuthorshipCases().find((x) => x.id === "ai-undisclosed")!;
    const review = await runReview({ files: c.files, repo: { paths: c.paths, commits: c.commits }, registryMode: "offline" });
    const au = review.findings.filter((f) => f.lane === "authorship");
    expect(au.length).toBeGreaterThan(4);
    expect(au.find((f) => f.title.startsWith("Undisclosed"))).toMatchObject({ severity: "high", label: "confirmed" });
    expect(au.filter((f) => f.label === "confirmed").every((f) => f.evidence.length >= 2)).toBe(true);
    // strength maps to label: strong -> confirmed, moderate -> likely, speculative -> speculative
    expect(au.find((f) => f.title.includes("large commits"))!.label).toBe("likely");
    // graph: file nodes for tool files, commit nodes for trailers
    expect(review.graph.nodes.some((n) => n.kind === "file" && n.label === ".cursorrules")).toBe(true);
    expect(review.graph.nodes.some((n) => n.kind === "commit")).toBe(true);
    expect(review.disclosure.markdown).toContain("`.cursorrules`");
    expect(review.authorship.status).toBe("undisclosed");
  });

  it("never offers an automatic patch for a signal, and the handoff says to disclose rather than remove", async () => {
    const scan = await scanSeeded();
    const c = listAuthorshipCases().find((x) => x.id === "claims-handwritten-has-claude")!;
    const review = await runReview({ files: c.files, repo: { paths: c.paths, commits: c.commits }, registryMode: "offline" });
    const f = review.findings.find((x) => x.lane === "authorship")!;
    expect(generateCandidates(f, c.files)).toEqual([]);
    void scan;
    const { putScan } = await import("@/core/service");
    putScan({ id: "auth-test", source: "local", label: "t", files: c.files, review, offline: true, notes: [] });
    const t = await tournamentFor("auth-test", f.id);
    expect(t.winner).toBeNull();
    expect(t.handoff).toMatch(/never patched automatically/);
    expect(t.handoff).toMatch(/Do not remove or hide the signal/);
  });

  it("clean and false-positive human fixtures add no strong or moderate findings", async () => {
    for (const id of ["human-clean", "human-fp-comments", "human-fp-history"]) {
      const c = listAuthorshipCases().find((x) => x.id === id)!;
      const r = await runReview({ files: c.files, repo: { paths: c.paths, commits: c.commits }, registryMode: "offline" });
      const au = r.findings.filter((f) => f.lane === "authorship");
      expect(au.every((f) => f.label === "speculative"), id).toBe(true);
    }
    void caseInput;
  });
});

describe("local git history", () => {
  it("parses git log with numstat, reads a real repository read-only, and returns [] outside one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assay-git-"));
    try {
      expect(readLocalCommits(dir)).toEqual([]);
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...a], { cwd: dir, stdio: "pipe" });
      git("init", "-q");
      fs.writeFileSync(path.join(dir, "a.txt"), "1\n2\n3\n");
      git("add", "."); git("commit", "-q", "-m", "first\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
      const before = fs.readdirSync(dir).sort();
      const commits = readLocalCommits(dir);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({ authorName: "T", additions: 3, deletions: 0 });
      expect(commits[0]!.message).toContain("Co-Authored-By: Claude");
      expect(fs.readdirSync(dir).sort()).toEqual(before);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    expect(parseGitLog("")).toEqual([]);
  });

  it("scanLocal audits a real repo: tool file + trailer, no README -> undisclosed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assay-local-"));
    try {
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", ...a], { cwd: dir, stdio: "pipe" });
      git("init", "-q");
      fs.mkdirSync(path.join(dir, ".claude")); fs.writeFileSync(path.join(dir, ".claude/settings.json"), "{}");
      fs.writeFileSync(path.join(dir, "a.py"), "x = 1\n");
      git("add", "-A"); git("commit", "-q", "-m", "init\n\nGenerated with [Claude Code](https://x.test)");
      const view = scanView(await scanLocal(dir, { offline: true }));
      expect(view.authorship.report.status).toBe("undisclosed");
      expect(view.authorship.report.signals.map((s) => s.ref)).toEqual(expect.arrayContaining(["tool-file:.claude/", expect.stringMatching(/^commit-trailer:/)]));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("authorship API route", () => {
  it("lists fixtures with eval metrics", async () => {
    const body = await (await get()).json();
    expect(body.cases.length).toBeGreaterThanOrEqual(6);
    expect(body.eval.falsePositiveRate).toBe(0);
  });
  it("returns a report and disclosure draft for a case, 404 for unknown", async () => {
    const body = await (await get("?case=mixed")).json();
    expect(body.report.status).toBe("disclosed");
    expect(body.report.overall).toBe("needs-review");
    expect(body.disclosure.markdown).toContain("How this was built");
    expect((await get("?case=zzz")).status).toBe(404);
  });
  it("refuses requests to hide signals with 422", async () => {
    const res = await get("?case=mixed&request=" + encodeURIComponent("hide the AI signals"));
    expect(res.status).toBe(422);
    expect((await res.json()).refused).toBe(true);
  });
});

describe("authorship module is read-only", () => {
  it("only uses read APIs of fs and only runs `git log`", () => {
    const dir = path.resolve(__dirname, "../src/authorship");
    const READ = new Set(["readFileSync", "readdirSync", "existsSync"]);
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(/\bfs\.(\w+)/g)) expect(READ.has(m[1]!), `${f}: fs.${m[1]}`).toBe(true);
      for (const m of src.matchAll(/spawn(?:Sync)?\(\s*"([^"]+)"\s*,\s*\[\s*"([^"]+)"/g)) { expect(m[1], f).toBe("git"); expect(["log", "ls-files"], f).toContain(m[2]); }
      expect(src, f).not.toMatch(/child_process.*exec\b|\bexecSync\b|filter-branch|filter-repo/);
    }
  });
});
