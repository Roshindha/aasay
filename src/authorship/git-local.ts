import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CommitInfo } from "./types";

const SEP = "\x1e", FIELD = "\x1f";

/** Parse `git log --numstat` output produced with the format used in `readLocalCommits`. */
export function parseGitLog(raw: string): CommitInfo[] {
  const out: CommitInfo[] = [];
  for (const block of raw.split(SEP).slice(1)) {
    const [sha, an, ae, cn, ce, date, message, rest = ""] = block.split(FIELD);
    if (!sha) continue;
    let add = 0, del = 0, any = false;
    for (const l of rest.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(l);
      if (m) { any = true; add += m[1] === "-" ? 0 : Number(m[1]); del += m[2] === "-" ? 0 : Number(m[2]); }
    }
    out.push({ sha: sha.trim(), authorName: an ?? "", authorEmail: ae ?? "", committerName: cn, committerEmail: ce, date: (date ?? "").trim(), message: (message ?? "").trim(), ...(any ? { additions: add, deletions: del } : {}) });
  }
  return out;
}

/** Read-only: runs `git log` in `dir` (never any command that changes the repository). Returns [] when `dir` is not a git repository. */
export function readLocalCommits(dir: string, max = 300): CommitInfo[] {
  if (!fs.existsSync(path.join(dir, ".git"))) return [];
  const r = spawnSync("git", ["log", `--max-count=${max}`, "--numstat", `--format=${SEP}%H${FIELD}%an${FIELD}%ae${FIELD}%cn${FIELD}%ce${FIELD}%aI${FIELD}%B${FIELD}`], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? parseGitLog(r.stdout) : [];
}

/** Read-only: `git ls-files` (tracked files only). Returns null when `dir` is not a git repository. */
export function readTrackedPaths(dir: string): string[] | null {
  if (!fs.existsSync(path.join(dir, ".git"))) return null;
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.split("\0").filter(Boolean) : null;
}
