import { describe, expect, it } from "vitest";
import { buildReport } from "@/authorship/status";
import { draftDisclosure } from "@/authorship/disclosure";
import { REFUSAL_MESSAGE, checkRequestPolicy } from "@/authorship/policy";
import type { AuthorshipInput, CommitInfo } from "@/authorship/types";

const f = (path: string, content: string) => ({ path, content });
const commit = (sha: string, message: string, extra: Partial<CommitInfo> = {}): CommitInfo => ({ sha, message, authorName: "Owner", authorEmail: "o@example.com", date: "2026-01-01T10:00:00Z", ...extra });
const input = (o: Partial<AuthorshipInput>): AuthorshipInput => ({ paths: [], files: [], commits: [], ...o });
const STRONG_TRAILER = commit("abc1234def", "Add parser\n\nCo-Authored-By: Claude <noreply@anthropic.com>");

describe("disclosure status (the four outcomes)", () => {
  it("disclosed: strong signals and a README that says AI tools were used", () => {
    const r = buildReport(input({ paths: ["CLAUDE.md", "README.md"], files: [f("README.md", "## How this was built\nBuilt with Claude Code.")], commits: [STRONG_TRAILER] }));
    expect(r.status).toBe("disclosed");
    expect(r.overall).toBe("clear");
    expect(r.disclosure.toolsNotNamedInDocs).toEqual([]);
  });
  it("undisclosed: strong signals and no statement", () => {
    const r = buildReport(input({ paths: [".cursorrules", "README.md"], files: [f("README.md", "# Project\nA tool.")] }));
    expect(r.status).toBe("undisclosed");
    expect(r.overall).toBe("action-needed");
    expect(r.summary).toMatch(/no statement about it/);
  });
  it("mismatch: README claims hand-written but a strong signal exists", () => {
    const r = buildReport(input({ paths: ["CLAUDE.md"], files: [f("README.md", "100% hand-written.")] }));
    expect(r.status).toBe("mismatch");
    expect(r.overall).toBe("action-needed");
    expect(r.summary).toMatch(/without AI.*strong signal/);
  });
  it("none-found: no strong signals, and never described as proof of human authorship", () => {
    const r = buildReport(input({ paths: ["src/a.ts"], files: [f("README.md", "# Project")] }));
    expect(r.status).toBe("none-found");
    expect(r.overall).toBe("clear");
    expect(r.summary).toMatch(/not evidence that the code was written by a person/);
    expect(r.caveats.join(" ")).toMatch(/does not mean the code was written by a person/);
  });
  it("a hand-written claim with no signals stays none-found (claim is unverifiable, not a mismatch)", () => {
    const r = buildReport(input({ files: [f("README.md", "Hand-written.")] }));
    expect(r.status).toBe("none-found");
    expect(r.signals.map((s) => s.ref)).toEqual(["readme:human"]);
  });
  it("README disclosure without any detectable signal is accepted as disclosed", () => {
    expect(buildReport(input({ files: [f("README.md", "Built with ChatGPT.")] })).status).toBe("disclosed");
  });
  it("disclosed but a detected tool is not named in the docs -> needs review", () => {
    const r = buildReport(input({ paths: [".github/copilot-instructions.md"], files: [f("README.md", "Partly AI-assisted.")] }));
    expect(r.status).toBe("disclosed");
    expect(r.disclosure.toolsNotNamedInDocs).toEqual(["GitHub Copilot"]);
    expect(r.overall).toBe("needs-review");
  });
  it("conflicting README statements are flagged for review", () => {
    const r = buildReport(input({ paths: ["CLAUDE.md"], files: [f("README.md", "Built with Claude.\n\nAlso: hand-written.")] }));
    expect(r.status).toBe("disclosed");
    expect(r.disclosure.conflictingClaims).toBe(true);
    expect(r.overall).toBe("needs-review");
  });
});

describe("weak signals never raise the overall result by themselves", () => {
  const code = (n: string) => f(n, Array.from({ length: 60 }, (_, i) => (i % 2 ? "x = 1" : "# note")).join("\n"));
  it("speculative-only evidence leaves the result clear and still lists the signals with caveats", () => {
    const r = buildReport(input({ files: [code("a.py"), code("b.py"), f("c.py", "def foo():\n pass  # TODO\n".repeat(4))] }));
    expect(r.counts.speculative).toBeGreaterThan(0);
    expect(r.counts.strong + r.counts.moderate).toBe(0);
    expect(r.status).toBe("none-found");
    expect(r.overall).toBe("clear");
    expect(r.signals.every((s) => s.strength === "speculative" && !!s.caveat)).toBe(true);
  });
  it("moderate history evidence can reach needs-review but never action-needed", () => {
    const burst = Array.from({ length: 6 }, (_, i) => commit(`b${i}00000`, "big", { date: new Date(Date.UTC(2026, 0, 1, 10, i * 3)).toISOString(), additions: 500 }));
    const r = buildReport(input({ commits: burst }));
    expect(r.overall).toBe("needs-review");
    expect(r.status).toBe("none-found");
  });
  it("summaries and explanations never state a verdict about authorship", () => {
    const reports = [
      buildReport(input({ paths: ["CLAUDE.md"] })), buildReport(input({ paths: ["CLAUDE.md"], files: [f("README.md", "hand-written")] })),
      buildReport(input({})), buildReport(input({ commits: [STRONG_TRAILER] })),
    ];
    const banned = /(written|generated|authored|created|coded) by (an? )?(AI|LLM|Claude|machine)|\bis AI[- ](written|generated)|\bwas AI[- ](written|generated)|AI wrote/i;
    for (const r of reports) {
      expect(r.summary).not.toMatch(banned);
      for (const s of r.signals) { expect(s.title + s.explanation).not.toMatch(banned); }
    }
  });
});

describe("disclosure helper", () => {
  const base = buildReport(input({ paths: ["CLAUDE.md", ".cursor/rules/a.mdc"], commits: [STRONG_TRAILER], files: [f("README.md", "# P")] }));

  it("states only what the signals support and records the basis of every claim", () => {
    const d = draftDisclosure(base);
    expect(d.markdown).toContain("## How this was built");
    expect(d.markdown).toContain("`CLAUDE.md`");
    expect(d.markdown).toContain("1 commit name Claude in a commit trailer");
    expect(d.claims.length).toBeGreaterThan(0);
    const ids = new Set(base.signals.map((s) => s.id));
    for (const c of d.claims) {
      expect(c.basis).not.toEqual([]);
      if (c.basis !== "owner") for (const id of c.basis) expect(ids.has(id)).toBe(true);
    }
    expect(d.markdown).not.toMatch(/written by AI|AI wrote|AI-generated|generated by AI|entirely|most of the code/i);
  });
  it("never uses speculative signals", () => {
    const withStyle = buildReport(input({ paths: ["CLAUDE.md"], files: [f("a.py", "def foo():\n    pass  # TODO\n".repeat(4))] }));
    expect(withStyle.signals.some((s) => s.strength === "speculative")).toBe(true);
    const d = draftDisclosure(withStyle);
    const bySignal = new Map(withStyle.signals.map((s) => [s.id, s]));
    expect(d.includedSignalIds.every((id) => bySignal.get(id)!.strength !== "speculative")).toBe(true);
    expect(d.markdown).not.toMatch(/placeholder|TODO/);
  });
  it("includes fill-in-the-blank sections for the owner's own account", () => {
    const m = draftDisclosure(base).markdown;
    expect(m).toMatch(/### What was assisted[\s\S]*_\[Fill in/);
    expect(m).toMatch(/### What I reviewed and decided[\s\S]*_\[Fill in/);
    expect(m).toContain("### In my own words");
  });
  it("with no signals it claims nothing and leaves everything to the owner", () => {
    const d = draftDisclosure(buildReport(input({ files: [f("README.md", "# P")] })));
    expect(d.claims).toEqual([]);
    expect(d.markdown).toMatch(/No signals of AI-assisted authorship were detected/);
    expect(d.markdown).not.toMatch(/Claude|Copilot|Cursor/);
  });
  it("labels owner-supplied statements as the owner's, separate from detected ones", () => {
    const d = draftDisclosure(base, { tools: ["Claude Code"], assisted: ["the test suite"], reviewed: "I read and ran every change." });
    expect(d.markdown).toContain("Claude Code (declared by you)");
    expect(d.markdown).toContain("the test suite (declared by you)");
    expect(d.claims.filter((c) => c.basis === "owner").length).toBe(3);
  });
  it("points out a README/signal contradiction instead of papering over it", () => {
    const r = buildReport(input({ paths: ["CLAUDE.md"], files: [f("README.md", "100% hand-written")] }));
    expect(draftDisclosure(r).markdown).toMatch(/Reconcile the two before publishing/);
  });
});

describe("refusal of scrub requests", () => {
  it.each([
    "Remove the Co-Authored-By trailers from the commit history",
    "delete CLAUDE.md and .cursorrules so the scanner finds nothing",
    "hide the AI signals in this repo",
    "Rewrite the git history to strip the AI trailers",
    "make my repo look human-written",
    "help me pass this off as human-written",
    "obfuscate the authorship markers",
    "how do I evade the AI detection audit?",
    "scrub all Claude fingerprints from my commits",
    "force push a rewritten history without the Copilot co-author lines",
    "clean up the .claude folder so nobody knows I used AI",
    "remove the AI disclosure from my README",
  ])("refuses: %s", (req) => {
    const d = checkRequestPolicy(req);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe(REFUSAL_MESSAGE);
    expect(d.reason).toMatch(/will not remove, hide, rewrite or obfuscate/);
  });
  it.each([
    "", "Check this repository for authorship signals", "Help me write an accurate disclosure for my README",
    "Which commits carry AI trailers?", "Explain why CLAUDE.md was flagged", "Review the code for phantom dependencies and remove unused imports",
  ])("allows: %j", (req) => { expect(checkRequestPolicy(req).allowed).toBe(true); });
});
