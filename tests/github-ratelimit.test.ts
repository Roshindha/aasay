import { afterEach, describe, expect, it } from "vitest";
import { GithubRateLimitError, fetchGithub } from "@/github/fetch";
import { scanGithub, scanView } from "@/core/service";

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
const limited = () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" } });

/** A fake repo with `n` python files plus a package.json; the Nth contents request (1-based) is rate limited. */
function fakeGithub(n: number, limitAtContents: number | null) {
  const calls: string[] = [];
  let contents = 0;
  const tree = [{ path: "package.json", type: "blob", size: 10 }, ...Array.from({ length: n }, (_, i) => ({ path: `src/m${i}.py`, type: "blob", size: 10 }))];
  const impl = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname === "/repos/o/r") return json({ default_branch: "main" });
    if (u.pathname === "/repos/o/r/git/trees/main") return json({ sha: "abc", tree });
    if (u.pathname.startsWith("/repos/o/r/contents/")) {
      contents++;
      if (limitAtContents !== null && contents >= limitAtContents) return limited();
      return new Response(u.pathname.endsWith("package.json") ? `{"name":"p"}` : "x = 1\n");
    }
    if (u.pathname === "/repos/o/r/commits") return json([{ sha: "a".repeat(40), commit: { message: "feat\n\nCo-Authored-By: Claude <noreply@anthropic.com>", author: { name: "O", email: "o@example.com", date: "2026-01-02T00:00:00Z" } }, author: { login: "o" } }]);
    return new Response("nf", { status: 404 });
  };
  return { impl, calls, contentCalls: () => contents };
}

afterEach(() => { delete process.env.ASSAY_OFFLINE; delete process.env.GITHUB_TOKEN; });

describe("GitHub rate limit during file download", () => {
  it("keeps the files already fetched, marks the scan partial, and stops asking", async () => {
    const g = fakeGithub(10, 4);
    const out = await fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: g.impl });
    expect(out.files).toHaveLength(3);
    expect(out.truncated).toBe(true);
    expect(out.rateLimited).toMatchObject({ resetAt: "2030-01-01T00:00:00.000Z" });
    expect(out.rateLimited!.message).toMatch(/rate limit reached/i);
    expect(out.skipped.filter((s) => s.endsWith("(rate limit)"))).toHaveLength(8);
    expect(g.contentCalls()).toBe(4); // one rejected request, then no retries and no further downloads
  });

  it("fails loudly (not with an empty scan) when the very first file request is limited", async () => {
    const g = fakeGithub(5, 1);
    await expect(fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: g.impl })).rejects.toBeInstanceOf(GithubRateLimitError);
    expect(g.contentCalls()).toBe(1);
  });

  it("unauthenticated scans default to 40 files so the whole scan fits in 60 requests; a token allows 80", async () => {
    const noTok = fakeGithub(100, null);
    const a = await fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: noTok.impl });
    expect(a.files).toHaveLength(40);
    expect(a.truncated).toBe(true);
    expect(noTok.calls.length).toBeLessThanOrEqual(2 + 40);
    const tok = fakeGithub(100, null);
    const b = await fetchGithub({ owner: "o", repo: "r" }, { token: "ghp_x", fetchImpl: tok.impl });
    expect(b.files).toHaveLength(80);
  });

  it("support files (manifests, README) are downloaded before code, so a partial scan still has them", async () => {
    const g = fakeGithub(10, 3);
    const out = await fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: g.impl });
    expect(out.files[0]!.path).toBe("package.json");
  });
});

describe("scanGithub under a rate limit", () => {
  it("reads commit history before downloading files, returns a partial scan with a clear note, and still audits authorship", async () => {
    process.env.ASSAY_OFFLINE = "1";
    const g = fakeGithub(10, 5);
    const view = scanView(await scanGithub("https://github.com/o/r", { offline: true, fetchImpl: g.impl }));
    const firstCommits = g.calls.findIndex((u) => u.includes("/commits?"));
    const firstContents = g.calls.findIndex((u) => u.includes("/contents/"));
    expect(firstCommits).toBeGreaterThanOrEqual(0);
    expect(firstCommits).toBeLessThan(firstContents);
    expect(view.notes.join(" | ")).toMatch(/partial scan: GitHub rate limit reached/);
    expect(view.notes.join(" | ")).toMatch(/skipped/);
    expect(view.authorship.report.coverage.commits).toBe(1);
    expect(view.authorship.report.signals.some((s) => s.kind === "commit-trailer")).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/ghp_|Bearer/);
  });
});
