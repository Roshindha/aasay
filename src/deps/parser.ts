import { pyImportToDist, specifierToNpmName } from "./names";

export type ImportKind = "import" | "dynamic-import" | "require" | "export-from" | "type-import" | "py-import" | "py-from";

export interface ParsedImport {
  /** Raw specifier as written (JS) or dotted module path (Python) */
  specifier: string;
  /** Normalized package/distribution name; null when relative/unresolvable */
  packageName: string | null;
  kind: ImportKind;
  language: "js" | "python";
  line: number;
  /** Python only: top-level import name (before distribution mapping) */
  pyTopLevel?: string;
}

/** Blank out comments and keep string literals, preserving offsets and newlines. */
function stripJsComments(src: string): { text: string; inStr: Uint8Array } {
  let out = "";
  const inStr = new Uint8Array(src.length);
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      if (i < n) { out += "  "; i += 2; }
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q) {
        inStr[i] = 1;
        if (src[i] === "\\") { out += src[i]! + (src[i + 1] ?? ""); if (i + 1 < n) inStr[i + 1] = 1; i += 2; continue; }
        if (q !== "`" && src[i] === "\n") break;
        out += src[i]; i++;
      }
      if (i < n && src[i] === q) { out += q; i++; }
    } else { out += c; i++; }
  }
  return { text: out, inStr };
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

const JS_PATTERNS: Array<{ re: RegExp; kind: ImportKind; group: number }> = [
  // import type X from "y"  /  import type { X } from "y"
  { re: /\bimport\s+type\s+(?:[\w$*{}\s,]+?)\s+from\s*(["'])([^"'\n]+)\1/g, kind: "type-import", group: 2 },
  // import x from "y" / import {a} from "y" / import * as x from "y"
  { re: /\bimport\s+(?!type\b)(?:[\w$*{}\s,]+?)\s+from\s*(["'])([^"'\n]+)\1/g, kind: "import", group: 2 },
  // import "side-effect"
  { re: /\bimport\s*(["'])([^"'\n]+)\1/g, kind: "import", group: 2 },
  // export ... from "y"
  { re: /\bexport\s+(?:type\s+)?(?:[\w$*{}\s,]+?)\s+from\s*(["'])([^"'\n]+)\1/g, kind: "export-from", group: 2 },
  // import("y")
  { re: /\bimport\s*\(\s*(["'`])([^"'`\n$]+)\1\s*\)/g, kind: "dynamic-import", group: 2 },
  // require("y")
  { re: /(?<![\w$.])require\s*\(\s*(["'`])([^"'`\n$]+)\1\s*\)/g, kind: "require", group: 2 },
];

export function parseJsImports(source: string): ParsedImport[] {
  const { text: src, inStr } = stripJsComments(source);
  const seen = new Set<string>();
  const out: ParsedImport[] = [];
  for (const { re, kind, group } of JS_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (inStr[m.index]) continue; // keyword is inside a string literal
      const specifier = m[group]!;
      // line of the specifier literal itself (multi-line imports report the `from` line)
      const specIdx = m.index + m[0].lastIndexOf(specifier);
      const line = lineOf(src, specIdx);
      const key = `${specIdx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ specifier, packageName: specifierToNpmName(specifier), kind, language: "js", line });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Remove Python comments and triple-quoted/regular string contents from a line-oriented scan. */
export function parsePythonImports(source: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  const lines = source.split(/\r?\n/);
  let inTriple: string | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    let raw = lines[idx]!;
    if (inTriple) {
      const end = raw.indexOf(inTriple);
      if (end === -1) continue;
      raw = raw.slice(end + 3);
      inTriple = null;
    }
    // drop triple-quoted strings that open (and maybe close) on this line
    for (;;) {
      const m = /("""|''')/.exec(raw);
      if (!m) break;
      const close = raw.indexOf(m[1]!, m.index + 3);
      if (close === -1) { raw = raw.slice(0, m.index); inTriple = m[1]!; break; }
      raw = raw.slice(0, m.index) + raw.slice(close + 3);
    }
    const code = raw.replace(/#.*$/, "");
    const line = idx + 1;

    // `import a.b, c as d`  (handle ; separated statements too)
    for (const stmt of code.split(";")) {
      const s = stmt.trim();
      let m = /^import\s+(.+)$/.exec(s);
      if (m) {
        for (const part of m[1]!.split(",")) {
          const mod = part.trim().split(/\s+as\s+/)[0]!.trim();
          if (!/^[A-Za-z_][\w.]*$/.test(mod)) continue;
          const top = mod.split(".")[0]!;
          out.push({ specifier: mod, packageName: pyImportToDist(top), kind: "py-import", language: "python", line, pyTopLevel: top });
        }
        continue;
      }
      m = /^from\s+(\.*)([A-Za-z_][\w.]*)?\s+import\b/.exec(s);
      if (m) {
        if (m[1]) continue; // relative import
        const mod = m[2]!;
        const top = mod.split(".")[0]!;
        out.push({ specifier: mod, packageName: pyImportToDist(top), kind: "py-from", language: "python", line, pyTopLevel: top });
      }
    }
  }
  return out;
}

export function languageOf(path: string): "js" | "python" | null {
  if (/\.(m|c)?(t|j)sx?$/.test(path)) return "js";
  if (/\.py$/.test(path)) return "python";
  return null;
}

export function parseImports(path: string, source: string): ParsedImport[] {
  const lang = languageOf(path);
  if (lang === "js") return parseJsImports(source);
  if (lang === "python") return parsePythonImports(source);
  return [];
}
