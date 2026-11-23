import crypto from "node:crypto";
import { FindingSchema, type Finding, type SourceFile } from "@/core/types";
import type { DepReport } from "@/deps/resolver";

export interface LaneContext {
  files: SourceFile[];
  /** Present when the dependency analysis has run (always, in the default pipeline) */
  deps?: DepReport;
}

export type Lane = (ctx: LaneContext) => Finding[];

type NewFinding = Omit<Finding, "id" | "evidence" | "lanes"> & { evidence?: string[] };

export function makeFinding(f: NewFinding): Finding {
  const id = crypto.createHash("sha1").update(`${f.lane}|${f.file}|${f.line}|${f.title}`).digest("hex").slice(0, 10);
  return FindingSchema.parse({ ...f, id: `${f.lane}:${id}`, evidence: f.evidence ?? [], lanes: [f.lane] });
}

export const isTestFile = (p: string) =>
  /(^|\/)(__tests__|tests?)\//.test(p) || /\.(test|spec)\.[mc]?[tj]sx?$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p) || /_test\.py$/.test(p);

export const isSpecFile = (p: string) => /(^|\/)(spec|specs|requirements|design)[^/]*\.md$/i.test(p);

export const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;

/** Resolve a repo-relative import target among known files. */
export function resolveJsModule(fromFile: string, spec: string, files: SourceFile[], aliasPrefixes: string[]): SourceFile | null | "external" {
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
  const find = (p: string) => {
    for (const e of exts) { const hit = files.find((f) => f.path === p + e); if (hit) return hit; }
    return null;
  };
  if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1);
    const parts = [...dir];
    for (const seg of spec.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
    return find(parts.join("/"));
  }
  const alias = aliasPrefixes.find((p) => spec.startsWith(p));
  if (alias) {
    const rest = spec.slice(alias.length);
    for (const f of files) {
      const noExt = f.path.replace(/\.[^./]+$/, "");
      if (noExt === rest || noExt.endsWith("/" + rest) || noExt === rest + "/index" || noExt.endsWith("/" + rest + "/index")) return f;
    }
    return null;
  }
  return "external";
}
