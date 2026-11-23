import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SourceFile, Telemetry } from "./types";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv", ".assay-cache", "coverage"]);
const TEXT_EXT = /\.(m|c)?(t|j)sx?$|\.py$|\.md$|\.json$|\.ya?ml$|\.toml$|\.txt$|\.lock$|^Pipfile$|^\.npmrc$/;

export interface LoadLimits { maxFiles: number; maxBytes: number }
export const DEFAULT_LIMITS: LoadLimits = { maxFiles: 300, maxBytes: 200_000 };

export function loadDir(root: string, limits: LoadLimits = DEFAULT_LIMITS): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= limits.maxFiles) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(full); continue; }
      if (!ent.isFile() || !TEXT_EXT.test(ent.name)) continue;
      if (fs.statSync(full).size > limits.maxBytes) continue;
      out.push({ path: path.relative(root, full).split(path.sep).join("/"), content: fs.readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}

/** Rough token estimate: chars / 4. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4);

export function contentKey(f: SourceFile): string {
  return `file:${f.path}@${crypto.createHash("sha1").update(f.content).digest("hex").slice(0, 12)}`;
}

export function buildTelemetry(files: SourceFile[], extraCacheKeys: string[] = []): Telemetry {
  const inspectedFiles = files.map((f) => ({ path: f.path, chars: f.content.length, estTokens: estimateTokens(f.content.length) }));
  return {
    inspectedFiles,
    totalEstTokens: inspectedFiles.reduce((n, f) => n + f.estTokens, 0),
    cacheKeys: [...files.map(contentKey), ...extraCacheKeys],
  };
}
