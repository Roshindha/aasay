import { allowlistedFetch, type FetchLike } from "@/core/allowlist";
import type { SourceFile } from "@/core/types";

export interface GithubRef { owner: string; repo: string; pull?: number }

export function parseGithubUrl(url: string): GithubRef {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:pull\/(\d+)(?:\/.*)?|tree\/.*|blob\/.*)?)?\/?$/.exec(url.trim());
  if (!m) throw new Error("Expected https://github.com/<owner>/<repo> or .../pull/<number>");
  return { owner: m[1]!, repo: m[2]!, pull: m[3] ? Number(m[3]) : undefined };
}

export interface FetchOptions { token?: string; fetchImpl?: FetchLike; maxFiles?: number; maxBytes?: number }
export interface FetchedRepo { files: SourceFile[]; ref: string; skipped: string[]; truncated: boolean; changed?: string[]; /** Every file path in the fetched tree (not just the downloaded ones) */ paths: string[]; commits?: import("@/authorship/types").CommitInfo[] }

const REVIEWABLE = /\.(m|c)?(t|j)sx?$|\.py$/;
const SUPPORT = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|Pipfile|Pipfile\.lock|poetry\.lock|tsconfig[^/]*\.json|jsconfig\.json|\.npmrc|readme[^/]*\.(md|rst|txt)|docs\/[^/]+\.(md|mdx)|(spec|specs|requirements|design)[^/]*\.md)$/i;

export async function fetchGithub(ref: GithubRef, opts: FetchOptions = {}): Promise<FetchedRepo> {
  const maxFiles = opts.maxFiles ?? 80, maxBytes = opts.maxBytes ?? 150_000;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "assay-app", "x-github-api-version": "2022-11-28" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`; // only ever sent to api.github.com (allowlistedFetch)
  const api = async (path: string, accept?: string) => {
    const res = await allowlistedFetch(`https://api.github.com${path}`, { headers: accept ? { ...headers, accept } : headers }, opts.fetchImpl);
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path.split("?")[0]}`);
    return res;
  };
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const skipped: string[] = [];
  let sha: string;
  let wanted: string[];
  let changed: string[] | undefined;
  let allPaths: Array<{ path: string; size: number }> = [];

  if (ref.pull) {
    const pr = (await (await api(`${base}/pulls/${ref.pull}`)).json()) as { head: { sha: string } };
    sha = pr.head.sha;
    const list: Array<{ filename: string; status: string }> = [];
    for (let page = 1; page <= 3; page++) {
      const batch = (await (await api(`${base}/pulls/${ref.pull}/files?per_page=100&page=${page}`)).json()) as typeof list;
      list.push(...batch);
      if (batch.length < 100) break;
    }
    changed = list.filter((f) => f.status !== "removed").map((f) => f.filename);
    wanted = changed.filter((p) => REVIEWABLE.test(p) || SUPPORT.test(p));
    const tree = (await (await api(`${base}/git/trees/${sha}?recursive=1`)).json()) as { tree: Array<{ path: string; type: string; size?: number }> };
    allPaths = tree.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, size: t.size ?? 0 }));
    for (const t of allPaths) if (SUPPORT.test(t.path) && !wanted.includes(t.path)) wanted.push(t.path);
  } else {
    const info = (await (await api(base)).json()) as { default_branch: string };
    const tree = (await (await api(`${base}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`)).json()) as { sha: string; tree: Array<{ path: string; type: string; size?: number }> };
    sha = tree.sha;
    allPaths = tree.tree.filter((t) => t.type === "blob" && !/(^|\/)(node_modules|dist|build|vendor|\.next)\//.test(t.path)).map((t) => ({ path: t.path, size: t.size ?? 0 }));
    const support = allPaths.filter((t) => SUPPORT.test(t.path)).map((t) => t.path);
    const code = allPaths.filter((t) => REVIEWABLE.test(t.path)).map((t) => t.path);
    wanted = [...support, ...code];
  }

  const sizeOf = new Map(allPaths.map((p) => [p.path, p.size]));
  const files: SourceFile[] = [];
  let truncated = false;
  for (const p of wanted) {
    if (files.length >= maxFiles) { truncated = true; skipped.push(`${p} (file cap ${maxFiles})`); continue; }
    if ((sizeOf.get(p) ?? 0) > maxBytes) { skipped.push(`${p} (> ${maxBytes} bytes)`); continue; }
    const res = await api(`${base}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`, "application/vnd.github.raw+json");
    const content = await res.text();
    if (content.length > maxBytes) { skipped.push(`${p} (> ${maxBytes} chars)`); continue; }
    files.push({ path: p, content });
  }
  return { files, ref: sha, skipped, truncated, changed, paths: allPaths.map((p) => p.path) };
}
