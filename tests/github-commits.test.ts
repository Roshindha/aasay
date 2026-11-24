import { afterEach, describe, expect, it, vi } from "vitest";
import { HostNotAllowedError } from "@/core/allowlist";
import { fetchCommits, fetchGithub, githubError, mapApiCommit } from "@/github/fetch";
import { scanGithub, scanView } from "@/core/service";

const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, ...init });
const apiCommit = (i: number, over: Record<string, unknown> = {}) => ({
  sha: `${String(i).padStart(2, "0")}${"a".repeat(38)}`,
  commit: { message: `commit ${i}`, author: { name: "Owner", email: "o@example.com", date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }, committer: { name: "Owner", email: "o@example.com" } },
  author: { login: "owner" },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("fetchCommits (api.github.com only)", () => {
  it("pages through repo commits, maps fields, and fetches line stats for the root commit only", async () => {
    const seen: string[] = [];
    const impl = async (url: string, init?: RequestInit) => {
      seen.push(url);
      expect(new URL(url).hostname).toBe("api.github.com");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ghp_secretsecretsecret");
      const u = new URL(url);
      if (u.pathname === "/repos/o/r/commits") {
        const page = Number(u.searchParams.get("page"));
        return json(page === 1 ? Array.from({ length: 100 }, (_, i) => apiCommit(i)) : Array.from({ length: 5 }, (_, i) => apiCommit(100 + i)));
      }
      if (u.pathname.startsWith("/repos/o/r/commits/")) return json({ ...apiCommit(104), stats: { additions: 4200, deletions: 3 } });
      return new Response("nf", { status: 404 });
    };
    const out = await fetchCommits({ owner: "o", repo: "r" }, { token: "ghp_secretsecretsecret", fetchImpl: impl });
    expect(out.commits).toHaveLength(105);
    expect(out.truncated).toBe(false);
    expect(out.statsFor).toBe(1);
    const root = out.commits.at(-1)!;
    expect(root).toMatchObject({ additions: 4200, deletions: 3 });
    expect(out.commits[0]!.additions).toBeUndefined();
    expect(seen.filter((u) => u.includes("/commits?")).length).toBe(2);
    expect(seen.some((u) => u.includes("page=3"))).toBe(false);
  });

  it("uses the PR commits endpoint for pull requests (oldest first)", async () => {
    const urls: string[] = [];
    const impl = async (url: string) => {
      urls.push(url);
      if (url.includes("/pulls/7/commits")) return json([apiCommit(1), apiCommit(2)]);
      return json({ ...apiCommit(1), stats: { additions: 10, deletions: 1 } });
    };
    const out = await fetchCommits({ owner: "o", repo: "r", pull: 7 }, { fetchImpl: impl });
    expect(urls[0]).toContain("/repos/o/r/pulls/7/commits?per_page=100&page=1");
    expect(out.commits).toHaveLength(2);
    expect(out.commits[0]!.additions).toBe(10); // oldest = first for a PR
  });

  it("caps the history and reports truncation without fetching stats", async () => {
    const impl = async (url: string) => json(Array.from({ length: 100 }, (_, i) => apiCommit(i + (url.includes("page=2") ? 100 : 0))));
    const out = await fetchCommits({ owner: "o", repo: "r" }, { fetchImpl: impl, maxCommits: 150 });
    expect(out.commits).toHaveLength(150);
    expect(out.truncated).toBe(true);
    expect(out.statsFor).toBe(0);
  });

  it("keeps the account login so AI-tool bot accounts can be recognised", () => {
    const c = mapApiCommit(apiCommit(1, { author: { login: "copilot-swe-agent[bot]", type: "Bot" }, commit: { message: "m", author: { name: "Copilot", email: "x@users.noreply.github.com", date: "2026-01-01T00:00:00Z" } } }));
    expect(c.authorName).toBe("Copilot (copilot-swe-agent[bot])");
  });

  it("never follows a redirect off the allowlist", async () => {
    const impl = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } });
    await expect(fetchCommits({ owner: "o", repo: "r" }, { fetchImpl: impl })).rejects.toThrow(HostNotAllowedError);
  });
});

describe("GitHub error messages", () => {
  const res = (status: number, headers: Record<string, string> = {}) => new Response("x", { status, headers });
  it("explains a rate limit with the reset time, and what to do without a token", () => {
    const e = githubError(res(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" }), "/repos/o/r/commits?page=1", false);
    expect(e.message).toMatch(/rate limit reached/i);
    expect(e.message).toContain("2030-01-01T00:00:00.000Z");
    expect(e.message).toMatch(/Set GITHUB_TOKEN/);
    expect(githubError(res(429, { "x-ratelimit-remaining": "0" }), "/x", true).message).toMatch(/token's limit is used up/);
  });
  it("401 and 404 messages never include the token or query strings", () => {
    const tok = "ghp_supersecrettokenvalue";
    for (const e of [githubError(res(401), `/repos/o/r?access_token=${tok}`, true), githubError(res(404), `/repos/o/r/commits?access_token=${tok}`, true), githubError(res(500), `/repos/o/r?x=${tok}`, true)]) {
      expect(e.message).not.toContain(tok);
      expect(e.message).not.toContain("?");
    }
    expect(githubError(res(404), "/repos/o/r", false).message).toMatch(/private/);
  });
  it("a plain 403 (not a rate limit) is reported as a plain API error", () => {
    expect(githubError(res(403), "/repos/o/r", false).message).toBe("GitHub API 403 for /repos/o/r");
  });
  it("fetchGithub surfaces the rate-limit message", async () => {
    const impl = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    await expect(fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: impl })).rejects.toThrow(/rate limit reached/i);
  });
});

describe("scanGithub with commit history", () => {
  function stub(commitsFail = false) {
    const impl = async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/repos/o/r") return json({ default_branch: "main" });
      if (u.pathname === "/repos/o/r/git/trees/main") return json({ sha: "abc", tree: [{ path: "README.md", type: "blob", size: 10 }, { path: "a.py", type: "blob", size: 10 }, { path: ".cursorrules", type: "blob", size: 5 }] });
      if (u.pathname === "/repos/o/r/contents/README.md") return new Response("# Tool\n");
      if (u.pathname === "/repos/o/r/contents/a.py") return new Response("x = 1\n");
      if (u.pathname === "/repos/o/r/commits") {
        if (commitsFail) return new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
        return json([apiCommit(2, { commit: { message: "feat\n\nCo-Authored-By: Claude <noreply@anthropic.com>", author: { name: "Owner", email: "o@example.com", date: "2026-01-03T00:00:00Z" } } }), apiCommit(1)]);
      }
      if (u.pathname.startsWith("/repos/o/r/commits/")) return json({ ...apiCommit(1), stats: { additions: 20, deletions: 0 } });
      return new Response("nf", { status: 404 });
    };
    return impl;
  }

  it("audits tree paths and commits: tool file + trailer, no README disclosure -> undisclosed", async () => {
    process.env.ASSAY_OFFLINE = "1";
    const view = scanView(await scanGithub("https://github.com/o/r", { offline: true, fetchImpl: stub() }));
    expect(view.authorship.report.status).toBe("undisclosed");
    expect(view.authorship.report.signals.map((s) => s.ref)).toEqual(expect.arrayContaining(["tool-file:.cursorrules", expect.stringMatching(/^commit-trailer:/)]));
    expect(view.authorship.report.coverage).toMatchObject({ commits: 2, commitStats: true });
    expect(view.notes.join(" ")).toMatch(/2 commits read/);
    delete process.env.ASSAY_OFFLINE;
  });

  it("a failing commits request does not fail the scan; the reason is noted and the token is not leaked", async () => {
    process.env.GITHUB_TOKEN = "ghp_neverleakthis123456";
    try {
      const view = scanView(await scanGithub("https://github.com/o/r", { offline: true, fetchImpl: stub(true) }));
      expect(view.authorship.report.coverage.commits).toBe(0);
      const note = view.notes.find((n) => n.startsWith("commit history unavailable"))!;
      expect(note).toMatch(/rate limit reached/i);
      expect(JSON.stringify(view)).not.toContain("ghp_neverleakthis123456");
      expect(view.authorship.report.status).toBe("undisclosed"); // tool file is still found from the tree
    } finally { delete process.env.GITHUB_TOKEN; }
  });
});
