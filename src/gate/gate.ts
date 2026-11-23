import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GateResult, SourceFile } from "@/core/types";
import { buildCheckEnv } from "./env";

export interface CheckSpec { name: string; cmd: string; args: string[]; timeoutMs?: number }
export interface GateOptions {
  /** Extra checks to run in the patched temp dir (sanitized env). Defaults detect tooling that needs no install. */
  checks?: CheckSpec[];
  parentEnv?: NodeJS.ProcessEnv;
}
export interface GateOutcome extends GateResult { patchedFiles: SourceFile[] }

function run(cmd: string, args: string[], cwd: string, env: Record<string, string>, timeoutMs = 20_000): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    let out = "";
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try { child = spawn(cmd, args, { cwd, env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { return resolve({ code: 127, output: (e as Error).message }); }
    const timer = setTimeout(() => { child.kill("SIGKILL"); out += "\n[timeout]"; }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: 127, output: e.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, output: out.slice(-4000) }); });
  });
}

/** Paths named in a unified diff (both sides), minus /dev/null. */
export function diffPaths(diff: string): string[] {
  const set = new Set<string>();
  for (const l of diff.split("\n")) {
    const m = /^(?:---|\+\+\+)\s+(?:[ab]\/)?(\S+)/.exec(l);
    if (m && m[1] !== "/dev/null") set.add(m[1]!);
  }
  return [...set];
}

function unsafePath(p: string): boolean {
  return path.isAbsolute(p) || p.split(/[\\/]/).includes("..") || p.includes("\0");
}

/** Apply `diff` to a copy of `files` inside a fresh temp dir; never touches the real tree. */
export async function runGate(files: SourceFile[], diff: string, opts: GateOptions = {}): Promise<GateOutcome> {
  const fail = (reason: string, output = ""): GateOutcome => ({
    applies: false, eligible: false, reason, patchedFiles: files,
    checks: [{ name: "git apply --check", ok: false, output }],
  });
  if (!diff.trim()) return fail("empty diff");
  const bad = diffPaths(diff).find(unsafePath);
  if (bad) return fail(`diff touches unsafe path: ${bad}`);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assay-gate-"));
  try {
    const env = buildCheckEnv(opts.parentEnv ?? process.env, { HOME: root, CI: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
    for (const f of files) {
      if (unsafePath(f.path)) continue;
      const full = path.join(root, f.path);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.content);
    }
    fs.writeFileSync(path.join(root, ".assay.patch"), diff.endsWith("\n") ? diff : diff + "\n");

    const checks: GateResult["checks"] = [];
    const check = await run("git", ["apply", "--check", "--whitespace=nowarn", ".assay.patch"], root, env);
    checks.push({ name: "git apply --check", ok: check.code === 0, output: check.output });
    if (check.code !== 0) return { applies: false, eligible: false, reason: "patch does not apply", checks, patchedFiles: files };
    const applied = await run("git", ["apply", "--whitespace=nowarn", ".assay.patch"], root, env);
    if (applied.code !== 0) {
      checks.push({ name: "git apply", ok: false, output: applied.output });
      return { applies: false, eligible: false, reason: "patch failed to apply", checks, patchedFiles: files };
    }

    const touched = diffPaths(diff).filter((p) => fs.existsSync(path.join(root, p)));
    const patchedFiles = files.map((f) => (touched.includes(f.path) ? { path: f.path, content: fs.readFileSync(path.join(root, f.path), "utf8") } : f));
    for (const p of touched) if (!files.some((f) => f.path === p)) patchedFiles.push({ path: p, content: fs.readFileSync(path.join(root, p), "utf8") });

    // built-in checks that need no installs
    for (const p of touched.filter((x) => x.endsWith(".json"))) {
      let ok = true, output = "valid JSON";
      try { JSON.parse(fs.readFileSync(path.join(root, p), "utf8")); } catch (e) { ok = false; output = (e as Error).message; }
      checks.push({ name: `json-valid ${p}`, ok, output });
    }
    for (const p of touched.filter((x) => x.endsWith(".py"))) {
      const r = await run("python3", ["-I", "-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", p], root, env);
      if (r.code === 127) checks.push({ name: `python-syntax ${p}`, ok: true, output: "python3 not available; skipped" });
      else checks.push({ name: `python-syntax ${p}`, ok: r.code === 0, output: r.output || "ok" });
    }
    for (const c of opts.checks ?? []) {
      const r = await run(c.cmd, c.args, root, env, c.timeoutMs);
      checks.push({ name: c.name, ok: r.code === 0, output: r.output });
    }
    const eligible = checks.every((c) => c.ok);
    return { applies: true, eligible, reason: eligible ? undefined : "a check failed", checks, patchedFiles };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
