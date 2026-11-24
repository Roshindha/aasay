import { allowlistedFetch, type FetchLike } from "@/core/allowlist";
import type { CommitInfo } from "@/authorship/types";
import type { SourceFile } from "@/core/types";

export interface GithubRef { owner: string; repo: string; pull?: number }

export function parseGithubUrl(url: string): GithubRef {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:pull\/(\d+)(?:\/.*)?|tree\/.*|blob\/.*)?)?\/?$/.exec(url.trim());
  if (!m) throw new Error("Expected https://github.com/<owner>/<repo> or .../pull/<number>");
  return { owner: m[1]!, repo: m[2]!, pull: m[3] ? Number(m[3]) : undefined };
}

export interface FetchOptions { token?: string; fetchImpl?: FetchLike; maxFiles?: number; maxBytes?: number }
export interface FetchedRepo { files: SourceFile[]; /** Set when the file download stopped early because GitHub's request budget ran out */ rateLimited?: { resetAt: string | null; message: string }; ref: string; skipped: string[]; truncated: boolean; changed?: string[]; /** Every file path in the fetched tree (not just the downloaded ones) */ paths: string[]; commits?: CommitInfo[] }

const REVIEWABLE = /\.(m|c)?(t|j)sx?$|\.py$/;
const SUPPORT = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|Pipfile|Pipfile\.lock|poetry\.lock|tsconfig[^/]*\.json|jsconfig\.json|\.npmrc|readme[^/]*\.(md|rst|txt)|docs\/[^/]+\.(md|mdx)|(spec|specs|requirements|design)[^/]*\.md)$/i;

/** Thrown when GitHub says the request budget is used up; callers can keep what they already fetched. */
export class GithubRateLimitError extends Error {
  constructor(message: string, public readonly resetAt: string | null) { super(message); this.name = "GithubRateLimitError"; }
}

/** Turns a failed GitHub response into a message that never contains credentials. */
export function githubError(res: Response, path: string, hadToken: boolean): Error {
  const where = path.split("?")[0];
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const resetAt = reset ? new Date(reset * 1000).toISOString() : null;
    const when = resetAt ? ` It resets at ${resetAt}.` : "";
    return new GithubRateLimitError(`GitHub rate limit reached.${when} ${hadToken ? "The configured token's limit is used up." : "Set GITHUB_TOKEN on the server for a higher limit."}`, resetAt);
  }
  if (res.status === 401) return new Error("GitHub rejected the credentials (401). Check the GITHUB_TOKEN configured on the server.");
  if (res.status === 404) return new Error(`GitHub API 404 for ${where}. The repository, pull request or ref may not exist, or it may be private${hadToken ? " and the token lacks access" : " (set GITHUB_TOKEN for private repositories)"}.`);
  return new Error(`GitHub API ${res.status} for ${where}`);
}

function githubClient(opts: FetchOptions) {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "assay-app", "x-github-api-version": "2022-11-28" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`; // only ever sent to api.github.com (allowlistedFetch)
  return async (path: string, accept?: string) => {
    const res = await allowlistedFetch(`https://api.github.com${path}`, { headers: accept ? { ...headers, accept } : headers }, opts.fetchImpl);
    if (!res.ok) throw githubError(res, path, !!opts.token);
    return res;
  };
}

interface ApiCommit {
  sha: string;
  commit: { message: string; author?: { name?: string; email?: string; date?: string }; committer?: { name?: string; email?: string; date?: string } };
  author?: { login?: string; type?: string } | null;
  committer?: { login?: string } | null;
  stats?: { additions?: number; deletions?: number };
}

export function mapApiCommit(c: ApiCommit): CommitInfo {
  const login = c.author?.login;
  const name = c.commit.author?.name ?? "";
  return {
    sha: c.sha, message: c.commit.message,
    // the account login is kept in the name so AI-tool bot accounts (e.g. "x[bot]") can be recognised
    authorName: login && !name.includes(login) ? `${name} (${login})` : name,
    authorEmail: c.commit.author?.email ?? "",
    committerName: c.commit.committer?.name, committerEmail: c.commit.committer?.email,
    date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
    ...(c.stats ? { additions: c.stats.additions ?? 0, deletions: c.stats.deletions ?? 0 } : {}),
  };
}

export interface CommitFetch { commits: CommitInfo[]; truncated: boolean; statsFor: number }

/**
 * Commit history for the authorship audit, via api.github.com only. A PR lists its own commits; a repo lists its default branch,
 * newest first, up to `maxCommits`. Line stats are not in list responses, so when the list is complete only the oldest (root)
 * commit is fetched in detail (one extra request) to support the "very large initial commit" pattern.
 */
export async function fetchCommits(ref: GithubRef, opts: FetchOptions & { maxCommits?: number } = {}): Promise<CommitFetch> {
  const api = githubClient(opts);
  const max = opts.maxCommits ?? 200;
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const list = ref.pull ? `${base}/pulls/${ref.pull}/commits` : `${base}/commits`;
  const commits: CommitInfo[] = [];
  let truncated = false;
  for (let page = 1; commits.length < max; page++) {
    const batch = (await (await api(`${list}?per_page=100&page=${page}`)).json()) as ApiCommit[];
    for (const c of batch) { if (commits.length < max) commits.push(mapApiCommit(c)); else truncated = true; }
    if (batch.length < 100) break;
    if (commits.length >= max) { truncated = true; break; }
  }
  let statsFor = 0;
  if (!truncated && commits.length > 1) {
    const oldest = ref.pull ? commits[0]! : commits[commits.length - 1]!;
    try {
      const d = (await (await api(`${base}/commits/${oldest.sha}`)).json()) as ApiCommit;
      if (d.stats) { oldest.additions = d.stats.additions ?? 0; oldest.deletions = d.stats.deletions ?? 0; statsFor = 1; }
    } catch { /* stats are optional */ }
  }
  return { commits, truncated, statsFor };
}

export async function fetchGithub(ref: GithubRef, opts: FetchOptions = {}): Promise<FetchedRepo> {
  // Unauthenticated GitHub allows 60 requests/hour and each file is one request, so the default has to leave room for the tree and history calls.
  const maxFiles = opts.maxFiles ?? (opts.token ? 80 : 40), maxBytes = opts.maxBytes ?? 150_000;
  const api = githubClient(opts);
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
  let rateLimited: FetchedRepo["rateLimited"];
  for (const p of wanted) {
    if (rateLimited) { skipped.push(`${p} (rate limit)`); continue; }
    if (files.length >= maxFiles) { truncated = true; skipped.push(`${p} (file cap ${maxFiles})`); continue; }
    if ((sizeOf.get(p) ?? 0) > maxBytes) { skipped.push(`${p} (> ${maxBytes} bytes)`); continue; }
    let content: string;
    try {
      const res = await api(`${base}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`, "application/vnd.github.raw+json");
      content = await res.text();
    } catch (e) {
      if (e instanceof GithubRateLimitError && files.length > 0) { rateLimited = { resetAt: e.resetAt, message: e.message }; truncated = true; skipped.push(`${p} (rate limit)`); continue; }
      throw e; // nothing fetched yet, or a different failure: surface it
    }
    if (content.length > maxBytes) { skipped.push(`${p} (> ${maxBytes} chars)`); continue; }
    files.push({ path: p, content });
  }
  return { files, ref: sha, skipped, truncated, changed, rateLimited, paths: allPaths.map((p) => p.path) };
}
