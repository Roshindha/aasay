import { describe, expect, it } from "vitest";
import { fetchGithub, parseGithubUrl } from "@/github/fetch";
import { HostNotAllowedError } from "@/core/allowlist";

describe("github fetcher", () => {
  it("parses repo and PR URLs, rejects others", () => {
    expect(parseGithubUrl("https://github.com/o/r")).toEqual({ owner: "o", repo: "r", pull: undefined });
    expect(parseGithubUrl("https://github.com/o/r/pull/12/files")).toMatchObject({ pull: 12 });
    expect(() => parseGithubUrl("https://evil.com/o/r")).toThrow();
    expect(() => parseGithubUrl("https://github.com/o")).toThrow();
  });

  it("fetches a PR's changed files plus manifests, sends the token only to api.github.com, and honours caps", async () => {
    const seen: Array<{ url: string; auth?: string }> = [];
    const impl = async (url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      seen.push({ url, auth: h.get("authorization") ?? undefined });
      const u = new URL(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.pathname === "/repos/o/r/pulls/3") return json({ head: { sha: "abc" } });
      if (u.pathname === "/repos/o/r/pulls/3/files") return json([{ filename: "src/a.ts", status: "modified" }, { filename: "README.md", status: "modified" }, { filename: "gone.ts", status: "removed" }]);
      if (u.pathname === "/repos/o/r/git/trees/abc") return json({ tree: [{ path: "package.json", type: "blob", size: 20 }, { path: "src/a.ts", type: "blob", size: 10 }, { path: "big.ts", type: "blob", size: 9e9 }] });
      if (u.pathname.startsWith("/repos/o/r/contents/")) return new Response(`content of ${decodeURIComponent(u.pathname.split("/contents/")[1]!)}`, { status: 200 });
      return new Response("nf", { status: 404 });
    };
    const out = await fetchGithub({ owner: "o", repo: "r", pull: 3 }, { token: "ghp_secret", fetchImpl: impl });
    expect(out.files.map((f) => f.path).sort()).toEqual(["package.json", "src/a.ts"]);
    expect(out.changed).toEqual(["src/a.ts", "README.md"]);
    expect(seen.every((s) => new URL(s.url).hostname === "api.github.com")).toBe(true);
    expect(seen.every((s) => s.auth === "Bearer ghp_secret")).toBe(true);

    const capped = await fetchGithub({ owner: "o", repo: "r", pull: 3 }, { fetchImpl: impl, maxFiles: 1 });
    expect(capped.files).toHaveLength(1);
    expect(capped.truncated).toBe(true);
  });

  it("surfaces API failures as errors and never contacts other hosts", async () => {
    await expect(fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: async () => new Response("no", { status: 404 }) })).rejects.toThrow(/GitHub API 404/);
    const redirect = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } });
    await expect(fetchGithub({ owner: "o", repo: "r" }, { fetchImpl: redirect })).rejects.toThrow(HostNotAllowedError);
  });
});
