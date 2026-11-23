import type { Finding } from "@/core/types";
import { lineAt, makeFinding, isTestFile, type Lane } from "./common";

const JS_ASSERT = /\b(expect|assert|should|expectTypeOf|t\.(is|true|deepEqual|throws)|toMatchSnapshot|verify)\b/;
const JS_TAUTOLOGY = [
  /\bexpect\(\s*(true|false|null|undefined|\d+|"[^"]*"|'[^']*')\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\(\s*\1\s*\)/,
  /\bexpect\(\s*true\s*\)\s*\.\s*toBeTruthy\(\s*\)/,
  /\bexpect\(\s*(?:1|true)\s*\)\s*\.\s*not\.toBe\(\s*(?:0|false)\s*\)/,
  /\bassert(?:\.ok|\.isTrue)?\(\s*true\s*\)/,
];

/** Index of the `}` that closes the `{` at `open`, ignoring strings and comments. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; } continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    if (c === "{") depth++;
    if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return src.length;
}

function jsTheater(path: string, src: string): Finding[] {
  const out: Finding[] = [];
  // it("name", async () => {  |  test("name", function () {  |  it.skip(...)  | it.todo
  const re = /\b(it|test)(\.(skip|todo|only|each))?\s*\(\s*(["'`])((?:\\.|(?!\4).)*)\4\s*(?:,\s*(?:async\s*)?(?:function\s*\w*\s*\([^)]*\)|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*\{)?/g;
  for (const m of src.matchAll(re)) {
    const line = lineAt(src, m.index!);
    const name = m[5]!;
    if (m[3] === "skip" || m[3] === "todo") {
      out.push(makeFinding({ lane: "test-theater", severity: "low", label: "likely", file: path, line, title: `Skipped test "${name}"`, detail: "A skipped/todo test provides no coverage.", evidence: ["it.skip / it.todo"] }));
      continue;
    }
    if (!m[0].endsWith("{")) continue; // not an inline callback
    const close = matchBrace(src, m.index! + m[0].length - 1);
    const body = src.slice(m.index! + m[0].length, close);
    if (!JS_ASSERT.test(body)) {
      out.push(makeFinding({ lane: "test-theater", severity: "medium", label: "likely", file: path, line, title: `Test "${name}" makes no assertions`, detail: "The test body never calls expect/assert, so it can only fail by throwing.", evidence: ["no expect/assert in body"] }));
      continue;
    }
    for (const t of JS_TAUTOLOGY) {
      const tm = t.exec(body);
      if (tm) {
        out.push(makeFinding({ lane: "test-theater", severity: "medium", label: "confirmed", file: path, line: lineAt(src, m.index! + m[0].length + tm.index), title: `Tautological assertion in "${name}"`, detail: `\`${tm[0]}\` can never fail.`, evidence: [tm[0]] }));
        break;
      }
    }
  }
  // mocking the module under test
  const self = /([^/]+)\.(?:test|spec)\.[mc]?[tj]sx?$/.exec(path)?.[1];
  if (self) {
    for (const m of src.matchAll(/\b(?:vi|jest)\.mock\(\s*["']\.\/([^"']+)["']/g)) {
      if (m[1]!.replace(/\.[^.]+$/, "") === self) {
        out.push(makeFinding({ lane: "test-theater", severity: "high", label: "likely", file: path, line: lineAt(src, m.index!), title: `Test mocks the module under test (${self})`, detail: "Mocking the unit being tested means assertions check the mock, not the code.", evidence: [m[0]] }));
      }
    }
  }
  return out;
}

const PY_ASSERT = /\b(assert\b|self\.assert\w+|pytest\.raises|pytest\.warns|\.assert_\w+|raises\()/;
const PY_TAUTOLOGY = [/^\s*assert\s+(True|1|"[^"]+"|'[^']+')\s*$/m, /^\s*assert\s+(\w+|\d+)\s*==\s*\1\s*$/m, /self\.assertTrue\(\s*True\s*\)/, /self\.assertEqual\(\s*(\d+|"[^"]*")\s*,\s*\1\s*\)/];

function pyTheater(path: string, src: string): Finding[] {
  const out: Finding[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/.exec(lines[i]!);
    if (!m) continue;
    const indent = m[1]!.length;
    let j = i + 1;
    const body: string[] = [];
    for (; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() && l.length - l.trimStart().length <= indent) break;
      body.push(l);
    }
    const text = body.join("\n");
    const prev = lines.slice(Math.max(0, i - 3), i).join("\n");
    if (/@pytest\.mark\.skip\b|@unittest\.skip\b|@pytest\.mark\.xfail\b/.test(prev)) {
      out.push(makeFinding({ lane: "test-theater", severity: "low", label: "likely", file: path, line: i + 1, title: `Skipped test ${m[2]}`, detail: "A skipped test provides no coverage.", evidence: ["skip decorator"] }));
      continue;
    }
    const code = text.replace(/#.*$/gm, "").replace(/("""|''')[\s\S]*?\1/g, "");
    if (!PY_ASSERT.test(code)) {
      out.push(makeFinding({ lane: "test-theater", severity: "medium", label: "likely", file: path, line: i + 1, title: `Test ${m[2]} makes no assertions`, detail: "No assert / raises / assert_* in the test body.", evidence: ["no assertion in body"] }));
      continue;
    }
    for (const t of PY_TAUTOLOGY) {
      const tm = t.exec(code);
      if (tm) {
        const off = body.findIndex((l) => l.includes(tm[0].trim()));
        out.push(makeFinding({ lane: "test-theater", severity: "medium", label: "confirmed", file: path, line: i + 2 + Math.max(0, off), title: `Tautological assertion in ${m[2]}`, detail: `\`${tm[0].trim()}\` can never fail.`, evidence: [tm[0].trim()] }));
        break;
      }
    }
  }
  return out;
}

export const testTheaterLane: Lane = ({ files }) => {
  const out: Finding[] = [];
  for (const f of files) {
    if (!isTestFile(f.path)) continue;
    if (/\.py$/.test(f.path)) out.push(...pyTheater(f.path, f.content));
    else if (/\.[mc]?[tj]sx?$/.test(f.path)) out.push(...jsTheater(f.path, f.content));
  }
  return out;
};
