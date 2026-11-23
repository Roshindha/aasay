import type { Finding, SourceFile } from "@/core/types";
import { languageOf } from "@/deps/parser";
import { isSpecFile, isTestFile, makeFinding, type Lane } from "./common";

interface SpecConst { name: string; value: string; line: number }
interface SpecFn { name: string; params: string[]; line: number }

const norm = (v: string) => v.trim().replace(/[;,]$/, "").replace(/^["'`]|["'`]$/g, "").replace(/_/g, "");

export function parseSpec(f: SourceFile): { consts: SpecConst[]; fns: SpecFn[] } {
  const consts: SpecConst[] = [], fns: SpecFn[] = [];
  f.content.split(/\r?\n/).forEach((line, i) => {
    const c = /`([A-Z][A-Z0-9_]{2,})`\s*(?:=|defaults? to|is)\s*`([^`]+)`/.exec(line);
    if (c) consts.push({ name: c[1]!, value: c[2]!, line: i + 1 });
    for (const m of line.matchAll(/`([A-Za-z_]\w*)\(([^)`]*)\)`/g)) {
      fns.push({ name: m[1]!, params: m[2]!.split(",").map((p) => p.trim()).filter(Boolean), line: i + 1 });
    }
  });
  return { consts, fns };
}

function findConst(files: SourceFile[], name: string): { file: string; line: number; value: string } | null {
  const re = new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)?\\s*${name}\\s*(?::\\s*[\\w<>\\[\\]| ]+)?\\s*=\\s*(.+?)\\s*;?\\s*$`);
  for (const f of files) {
    if (!languageOf(f.path) || isTestFile(f.path)) continue;
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]!);
      if (m && /^\s*(export|const|let|var|[A-Z_0-9]+\s*=)/.test(lines[i]!)) return { file: f.path, line: i + 1, value: m[1]!.replace(/\s*#.*$|\s*\/\/.*$/, "") };
    }
  }
  return null;
}

function paramNames(raw: string): string[] {
  const parts: string[] = []; let depth = 0, cur = "";
  for (const ch of raw) {
    if ("([{<".includes(ch)) depth++; if (")]}>".includes(ch)) depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim().replace(/^\.\.\./, "").replace(/^\*+/, "").split(/[:=?\s]/)[0]!).filter((p) => p && p !== "self" && p !== "cls");
}

function findFn(files: SourceFile[], name: string): { file: string; line: number; params: string[] } | null {
  const pats = [
    new RegExp(`\\bfunction\\s*\\*?\\s*${name}\\s*(?:<[^>]*>)?\\s*\\(([^)]*)\\)`),
    new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*(?::[^=]+)?=>`),
    new RegExp(`^\\s*(?:async\\s+)?def\\s+${name}\\s*\\(([^)]*)\\)`),
  ];
  for (const f of files) {
    if (!languageOf(f.path) || isTestFile(f.path)) continue;
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) for (const re of pats) {
      const m = re.exec(lines[i]!);
      if (m) return { file: f.path, line: i + 1, params: paramNames(m[1]!) };
    }
  }
  return null;
}

export const specDriftLane: Lane = ({ files }) => {
  const out: Finding[] = [];
  for (const spec of files.filter((f) => isSpecFile(f.path))) {
    const { consts, fns } = parseSpec(spec);
    for (const c of consts) {
      const hit = findConst(files, c.name);
      if (!hit) continue;
      if (norm(hit.value) !== norm(c.value)) out.push(makeFinding({
        lane: "spec-drift", severity: "medium", label: "confirmed", file: hit.file, line: hit.line,
        title: `\`${c.name}\` is ${hit.value} but the spec says ${c.value}`, detail: `${spec.path}:${c.line} defines ${c.name} = ${c.value}; ${hit.file}:${hit.line} has ${hit.value}.`,
        evidence: [`${spec.path}:${c.line}`, `${hit.file}:${hit.line}`],
      }));
    }
    for (const fn of fns) {
      const hit = findFn(files, fn.name);
      if (!hit) continue; // unimplemented spec items are not reported: the scan may be partial
      const same = hit.params.length === fn.params.length;
      if (!same) out.push(makeFinding({
        lane: "spec-drift", severity: "medium", label: "likely", file: hit.file, line: hit.line,
        title: `\`${fn.name}\` takes ${hit.params.length} parameter(s); spec lists ${fn.params.length}`,
        detail: `Spec: ${fn.name}(${fn.params.join(", ")}) at ${spec.path}:${fn.line}. Code: ${fn.name}(${hit.params.join(", ")}).`,
        evidence: [`${spec.path}:${fn.line}`, `${hit.file}:${hit.line}`],
      }));
      else if (hit.params.some((p, i) => p !== fn.params[i])) out.push(makeFinding({
        lane: "spec-drift", severity: "low", label: "speculative", file: hit.file, line: hit.line,
        title: `\`${fn.name}\` parameter names differ from the spec`,
        detail: `Spec: (${fn.params.join(", ")}); code: (${hit.params.join(", ")}).`, evidence: [`${spec.path}:${fn.line}`, `${hit.file}:${hit.line}`],
      }));
    }
  }
  return out;
};
