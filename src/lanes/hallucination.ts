import type { Finding, SourceFile } from "@/core/types";
import { collectDeclared } from "@/deps/manifests";
import { languageOf } from "@/deps/parser";
import { lineAt, makeFinding, resolveJsModule, type Lane } from "./common";

/** Well-known APIs that models invent. Each entry: pattern + what exists instead. */
const JS_FAKE_APIS: Array<{ re: RegExp; fix: string }> = [
  { re: /\bPromise\.(allResolved|resolveAll|series|map|each)\s*\(/g, fix: "Promise.all / Promise.allSettled" },
  { re: /\bJSON\.(tryParse|parseSafe|safeParse)\s*\(/g, fix: "JSON.parse inside try/catch" },
  { re: /\bObject\.(deepClone|isEmpty|clone|deepMerge)\s*\(/g, fix: "structuredClone / Object.keys(x).length" },
  { re: /\bArray\.(flatten|unique|range|flat)\s*\(/g, fix: "Array.prototype.flat / new Set / Array.from" },
  { re: /\bMath\.(clamp|sum|randomInt)\s*\(/g, fix: "Math.min/Math.max" },
  { re: /\bfs\.(existsAsync|readFileAsync|writeFileAsync)\s*\(/g, fix: "fs.promises.*" },
  { re: /\bString\.(format|isEmpty)\s*\(/g, fix: "template literals" },
];

const PY_FAKE_APIS: Array<{ re: RegExp; fix: string }> = [
  { re: /\bjson\.(parse|stringify|load_string|loads_safe)\s*\(/g, fix: "json.loads / json.dumps" },
  { re: /\bos\.(getcwdu|makedir|mkdirs|exists|isfile|isdir)\s*\(/g, fix: "os.getcwd / os.makedirs / os.path.exists" },
  { re: /\bos\.path\.(exist|isdirectory|joinpath|exists_dir)\s*\(/g, fix: "os.path.exists / os.path.join" },
  { re: /\btime\.(clock|millis|now)\s*\(/g, fix: "time.perf_counter / time.time" },
  { re: /\bstring\.(letters|maketrans_|lowercase|uppercase)\b/g, fix: "string.ascii_letters" },
  { re: /\b(?:re|random|math)\.(match_all|randomint|clamp)\s*\(/g, fix: "re.findall / random.randint / min,max" },
];

function maskCommentsAndStrings(src: string, py: boolean): string {
  // keep offsets/newlines; blank out comments and string contents so API patterns inside them don't match
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i]!;
    if (py ? c === "#" : c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") { out += " "; i++; } }
    else if (!py && c === "/" && src[i + 1] === "*") { out += "  "; i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; } out += "  "; i += 2; }
    else if (c === '"' || c === "'" || (!py && c === "`")) {
      const triple = py && src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      out += q; i += q.length;
      while (i < src.length && !src.startsWith(q, i)) { if (src[i] === "\\") { out += "  "; i += 2; continue; } if (!triple && src[i] === "\n") break; out += src[i] === "\n" ? "\n" : " "; i++; }
      if (src.startsWith(q, i)) { out += q; i += q.length; }
    } else { out += c; i++; }
  }
  return out;
}

function jsExports(f: SourceFile): { names: Set<string>; star: boolean; hasDefault: boolean } {
  const names = new Set<string>();
  let star = false, hasDefault = false;
  const src = maskCommentsAndStrings(f.content, false);
  for (const m of src.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of f.content.matchAll(/\bexport\s*(?:type\s*)?\{([^}]*)\}(?:\s*from\s*["'][^"']+["'])?/g)) {
    for (const part of m[1]!.split(",")) {
      const t = part.trim(); if (!t) continue;
      const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(t);
      names.add(as ? as[1]! : t.replace(/^type\s+/, ""));
    }
  }
  if (/\bexport\s*\*/.test(src)) star = true;
  if (/\bexport\s+default\b/.test(src)) hasDefault = true;
  if (/\bmodule\.exports\b|\bexports\.\w+\s*=/.test(src)) star = true; // CJS: don't judge
  return { names, star, hasDefault };
}

function pyDefinedNames(f: SourceFile): { names: Set<string>; dynamic: boolean } {
  const names = new Set<string>();
  let dynamic = false;
  for (const line of f.content.split(/\r?\n/)) {
    let m = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(line) ?? /^class\s+([A-Za-z_]\w*)/.exec(line);
    if (m) { names.add(m[1]!); continue; }
    m = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/.exec(line);
    if (m) { names.add(m[1]!); continue; }
    m = /^(?:from\s+\S+\s+)?import\s+(.+)$/.exec(line);
    if (m) {
      if (m[1]!.trim() === "*") dynamic = true;
      for (const p of m[1]!.replace(/[()]/g, "").split(",")) { const a = p.trim().split(/\s+as\s+/); const n = (a[1] ?? a[0])!.trim(); if (/^[A-Za-z_]\w*$/.test(n)) names.add(n); }
    }
    if (/^def __getattr__\b/.test(line)) dynamic = true;
  }
  return { names, dynamic };
}

function resolvePy(fromFile: string, rel: string, mod: string, files: SourceFile[]): SourceFile | null {
  const dirParts = fromFile.split("/").slice(0, -1);
  const modPath = mod.replace(/\./g, "/");
  const bases: string[][] = rel
    ? [dirParts.slice(0, Math.max(0, dirParts.length - (rel.length - 1)))]
    : [dirParts, [], ["src"]];
  for (const b of bases) {
    const p = [...b, modPath].filter(Boolean).join("/");
    const hit = files.find((f) => f.path === `${p}.py` || f.path === `${p}/__init__.py`);
    if (hit) return hit;
  }
  return null;
}

export const hallucinationLane: Lane = ({ files }) => {
  const out: Finding[] = [];
  const declared = collectDeclared(files);

  for (const f of files) {
    const lang = languageOf(f.path);
    if (!lang) continue;
    const masked = maskCommentsAndStrings(f.content, lang === "python");

    // 1. well-known invented APIs
    const table = lang === "js" ? JS_FAKE_APIS : PY_FAKE_APIS;
    for (const { re, fix } of table) {
      re.lastIndex = 0;
      for (const m of masked.matchAll(re)) {
        const api = m[0].replace(/\s*\($/, "");
        const defined = new RegExp(`${api.replace(/\./g, "\\.")}\\s*=`).test(masked);
        if (defined) continue;
        out.push(makeFinding({
          lane: "hallucination", severity: "high", label: "likely", file: f.path, line: lineAt(f.content, m.index!),
          title: `\`${api}\` does not exist`, detail: `The call to \`${api}\` looks plausible but is not part of the standard API. Use ${fix}.`,
          evidence: [`matched known-invented-API table (${lang})`],
        }));
      }
    }

    // 2. JS: named imports not exported by the target file; missing relative module
    if (lang === "js") {
      for (const m of masked.matchAll(/\bimport\s+(type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(["'])([^"'\n]+)\4/g)) {
        const spec = f.content.slice(m.index!).match(/from\s*(["'])([^"'\n]+)\1/)?.[2] ?? m[5]!;
        const target = resolveJsModule(f.path, spec, files, declared.aliasPrefixes);
        const line = lineAt(f.content, m.index! + m[0].lastIndexOf("from"));
        if (target === "external") continue;
        if (target === null) {
          if (spec.startsWith(".")) out.push(makeFinding({
            lane: "hallucination", severity: "high", label: "likely", file: f.path, line,
            title: `Import of missing module \`${spec}\``, detail: `No file in the scanned tree resolves "${spec}".`, evidence: [`resolved against ${files.length} scanned files`],
          }));
          continue;
        }
        const ex = jsExports(target);
        if (ex.star) continue;
        const wanted = (m[3] ?? "").split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
        for (const name of wanted) {
          if (ex.names.has(name)) continue;
          const near = [...ex.names].find((n) => n.toLowerCase().includes(name.slice(0, 5).toLowerCase())) ;
          out.push(makeFinding({
            lane: "hallucination", severity: "critical", label: "confirmed", file: f.path, line,
            title: `\`${name}\` is not exported by \`${spec}\``,
            detail: `${target.path} exports: ${[...ex.names].join(", ") || "(nothing)"}.${near ? ` Did you mean \`${near}\`?` : ""}`,
            evidence: [`parsed exports of ${target.path}`],
          }));
        }
        if (m[2] && !ex.hasDefault && !ex.star) {
          out.push(makeFinding({
            lane: "hallucination", severity: "high", label: "confirmed", file: f.path, line,
            title: `\`${spec}\` has no default export`, detail: `Default import \`${m[2]}\` but ${target.path} has no \`export default\`.`, evidence: [`parsed exports of ${target.path}`],
          }));
        }
      }
    }

    // 3. Python: `from local_module import missing`
    if (lang === "python") {
      for (const m of masked.matchAll(/^from\s+(\.*)([A-Za-z_][\w.]*)?\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
        const mod = m[2]; if (!mod) continue;
        const target = resolvePy(f.path, m[1]!, mod, files);
        if (!target) continue;
        const { names, dynamic } = pyDefinedNames(target);
        if (dynamic) continue;
        const line = lineAt(f.content, m.index!);
        for (const raw of m[3]!.replace(/[()]/g, "").split(",")) {
          const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
          if (!name || name === "*" || !/^[A-Za-z_]\w*$/.test(name)) continue;
          if (names.has(name)) continue;
          // could be a submodule
          if (files.some((x) => x.path.endsWith(`/${mod.replace(/\./g, "/")}/${name}.py`) || x.path === `${mod.replace(/\./g, "/")}/${name}.py`)) continue;
          out.push(makeFinding({
            lane: "hallucination", severity: "critical", label: "confirmed", file: f.path, line,
            title: `\`${name}\` is not defined in \`${mod}\``, detail: `${target.path} defines: ${[...names].join(", ") || "(nothing)"}.`, evidence: [`parsed top-level names of ${target.path}`],
          }));
        }
      }
    }
  }
  return out;
};
