import { AI_CLAIM_PATTERNS, HUMAN_CLAIM_PATTERNS, NEGATION_BEFORE, OBJECT_OF_REVIEW_BEFORE, TOOL_FILE_RULES, identifyTool } from "./patterns";
import { HISTORY_CAVEAT, STYLE_CAVEAT, type AuthorshipInput, type CommitInfo, type Signal } from "./types";

const short = (sha: string) => sha.slice(0, 7);
const mk = (s: Omit<Signal, "id">): Signal => ({ id: `${s.kind}:${s.ref}`, ...s });

/* 1. Commit trailers and AI/bot authors (strong) */
export function detectCommitSignals(commits: CommitInfo[]): Signal[] {
  const out: Signal[] = [];
  for (const c of commits) {
    const evidence: string[] = [];
    let tool: string | undefined;
    for (const raw of c.message.split(/\r?\n/)) {
      const line = raw.trim();
      let m = /^co-authored-by:\s*(.+?)\s*(?:<([^>]*)>)?\s*$/i.exec(line);
      if (m) {
        const t = identifyTool(`${m[1]} ${m[2] ?? ""}`);
        if (t) { evidence.push(line); tool ??= t; }
        continue;
      }
      m = /^\W{0,4}generated\s+(?:with|by|using)\s+\[?([^\]\n(]+)/i.exec(line);
      if (m) { const t = identifyTool(m[1]!); if (t) { evidence.push(line); tool ??= t; } continue; }
      m = /^(claude|cursor|copilot|aider|codex|gemini|devin)[- ]?(?:session|agent|task|run)[\w -]*:\s*\S+/i.exec(line);
      if (m) { evidence.push(line); tool ??= identifyTool(m[1]!) ?? undefined; }
    }
    if (evidence.length) {
      out.push(mk({
        kind: "commit-trailer", strength: "strong", ref: `commit-trailer:${short(c.sha)}`, commit: c.sha,
        tool, title: `Commit ${short(c.sha)} carries an AI-tool trailer${tool ? ` (${tool})` : ""}`,
        explanation: "The commit message itself names an AI tool as co-author or generator. That records that a tool was involved in this commit; it does not say how much of the change it wrote.",
        evidence: [`${short(c.sha)}: ${evidence.join(" | ")}`],
      }));
    }
    const who = `${c.authorName} ${c.authorEmail} ${c.committerName ?? ""} ${c.committerEmail ?? ""}`;
    const isBotish = /\[bot\]|@anthropic\.com|@openai\.com|cursoragent|noreply@cursor|copilot|devin-ai|\(aider\)/i.test(who);
    const t = isBotish ? identifyTool(who) : null;
    if (t) {
      out.push(mk({
        kind: "bot-author", strength: "strong", ref: `bot-author:${short(c.sha)}`, commit: c.sha, tool: t,
        title: `Commit ${short(c.sha)} is attributed to an AI-tool account (${t})`,
        explanation: "The commit's author or committer identity belongs to an AI coding tool or its bot account. Dependency and CI bots are not counted here.",
        evidence: [`${short(c.sha)}: author "${c.authorName} <${c.authorEmail}>"`],
      }));
    }
  }
  return out;
}

/* 2. Committed AI-tool configuration (strong) */
export function detectToolFiles(paths: string[]): Signal[] {
  const out: Signal[] = [];
  for (const rule of TOOL_FILE_RULES) {
    const hits = paths.filter(rule.match).sort();
    if (!hits.length) continue;
    out.push(mk({
      kind: "tool-file", strength: "strong", ref: `tool-file:${rule.ref}`, file: hits[0], tool: rule.tool,
      title: `${rule.ref} is committed`,
      explanation: `This ${rule.ref.endsWith("/") ? "folder" : "file"} configures ${rule.tool} for the repository. It shows the tool was set up here; it does not show how much code the tool wrote, or that the owner did not review it.`,
      evidence: hits.slice(0, 5).concat(hits.length > 5 ? [`… and ${hits.length - 5} more`] : []),
    }));
  }
  return out;
}

/* 3. README / docs statements (moderate) */
const isDoc = (p: string) => /^readme(\.\w+)?$/i.test(p.split("/").pop()!) && p.split("/").length <= 2 || /^docs\/.+\.(md|mdx|txt|rst)$/i.test(p);

/** Blank out fenced code blocks and inline code so documentation *about* these phrases is not read as a claim. */
function proseOnly(text: string): string {
  let inFence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return ""; }
    if (inFence) return "";
    return l.replace(/`[^`]*`/g, " ").replace(/<!--.*?-->/g, " ").replace(/^\s*>.*$/, "");
  }).join("\n");
}

export function detectReadmeStatements(files: AuthorshipInput["files"]): Signal[] {
  const found: Record<"ai-assisted" | "human-only", { file: string; line: number; text: string }[]> = { "ai-assisted": [], "human-only": [] };
  for (const f of files.filter((x) => isDoc(x.path))) {
    proseOnly(f.content).split("\n").forEach((line, i) => {
      const hasHuman = HUMAN_CLAIM_PATTERNS.some((re) => re.test(line));
      let hasAi = false;
      for (const re of AI_CLAIM_PATTERNS) {
        const m = re.exec(line);
        const before = m ? line.slice(0, m.index) : "";
        if (m && !NEGATION_BEFORE.test(before) && !OBJECT_OF_REVIEW_BEFORE.test(before)) { hasAi = true; break; }
      }
      const clean = f.content.split(/\r?\n/)[i]!.trim().slice(0, 160);
      if (hasHuman) found["human-only"].push({ file: f.path, line: i + 1, text: clean });
      else if (hasAi) found["ai-assisted"].push({ file: f.path, line: i + 1, text: clean });
    });
  }
  const out: Signal[] = [];
  const spec: Array<["ai-assisted" | "human-only", string, string, string]> = [
    ["ai-assisted", "readme:ai", "Documentation says AI tools were used", "The project's own documentation states that AI tools were involved. This is the owner's account; it is checked against the other signals."],
    ["human-only", "readme:human", "Documentation says no AI was used", "The project's own documentation claims it was written without AI. Assay cannot verify that claim; it is compared with the other signals and reported as a mismatch if strong signals exist."],
  ];
  for (const [claim, ref, title, explanation] of spec) {
    const hits = found[claim];
    if (!hits.length) continue;
    out.push(mk({ kind: "readme-statement", strength: "moderate", ref, claim, file: hits[0]!.file, line: hits[0]!.line, title, explanation, evidence: hits.slice(0, 4).map((h) => `${h.file}:${h.line}: ${h.text}`) }));
  }
  return out;
}

/* 4. Commit-history shape (moderate at most) */
const changed = (c: CommitInfo) => (c.additions ?? 0) + (c.deletions ?? 0);

export function detectHistoryPatterns(commits: CommitInfo[]): Signal[] {
  const out: Signal[] = [];
  if (commits.length < 2) return out;
  const sorted = [...commits].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const hasStats = commits.some((c) => c.additions !== undefined);

  // many large commits within minutes
  if (hasStats) {
    const big = sorted.filter((c) => changed(c) >= 300);
    const WINDOW = 30 * 60_000;
    let best: CommitInfo[] = [];
    for (let i = 0; i < big.length; i++) {
      const w = big.filter((c) => Date.parse(c.date) >= Date.parse(big[i]!.date) && Date.parse(c.date) - Date.parse(big[i]!.date) <= WINDOW);
      if (w.length > best.length) best = w;
    }
    if (best.length >= 5) {
      out.push(mk({
        kind: "history-pattern", strength: "moderate", ref: "history:burst", caveat: HISTORY_CAVEAT,
        title: `${best.length} large commits within 30 minutes`,
        explanation: "A burst of several large commits in a short time is unusual for manual work but common for generated or scripted changes, bulk imports and refactors. It is a prompt to look closer.",
        evidence: best.slice(0, 6).map((c) => `${short(c.sha)} ${c.date} (${changed(c)} lines)`),
      }));
    }
    const root = sorted[0]!;
    const total = sorted.reduce((n, c) => n + (c.additions ?? 0), 0);
    if ((root.additions ?? 0) >= 1500 && total > 0 && (root.additions ?? 0) / total >= 0.6) {
      out.push(mk({
        kind: "history-pattern", strength: "speculative", ref: "history:large-initial", caveat: HISTORY_CAVEAT, commit: root.sha,
        title: "One very large initial commit",
        explanation: "Most of the repository arrived in a single first commit. Projects imported from elsewhere, squashed, or published after private development look the same.",
        evidence: [`${short(root.sha)} added ${root.additions} lines (${Math.round(((root.additions ?? 0) / total) * 100)}% of all added lines)`],
      }));
    }
  }

  // uniform structured messages
  if (commits.length >= 8) {
    const structured = commits.filter((c) => {
      const [subject = "", ...rest] = c.message.split(/\r?\n/);
      const bullets = rest.filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
      return /^[a-z]+(\([^)]*\))?!?:\s/.test(subject) && subject.length <= 72 && bullets >= 2;
    });
    if (structured.length / commits.length >= 0.8) {
      out.push(mk({
        kind: "history-pattern", strength: "speculative", ref: "history:uniform-messages", caveat: HISTORY_CAVEAT,
        title: `${structured.length} of ${commits.length} commit messages follow one structured template`,
        explanation: "Nearly every commit has a conventional-commit subject and a bulleted body. Careful humans and commit-message templates produce this too.",
        evidence: structured.slice(0, 3).map((c) => `${short(c.sha)}: ${c.message.split("\n")[0]}`),
      }));
    }
  }
  return out;
}

/* 5. Code-style patterns (always speculative) */
const CODE = /\.(m|c)?(t|j)sx?$|\.py$/;
const GENERIC = /\b(?:def|function|const|let|var)\s+(process_?data|handle_?data|do_?something|helper_?function|my_?function|example_?function|processData|handleData|doSomething|helperFunction|myFunction|exampleFunction|foo|bar|baz)\b/g;
const PLACEHOLDER = /TODO:?\s*implement|implement (?:this|me|here)|your code here|lorem ipsum|replace (?:this|with your)|raise NotImplementedError|pass\s*#\s*TODO/gi;

export function detectStylePatterns(files: AuthorshipInput["files"]): Signal[] {
  const code = files.filter((f) => CODE.test(f.path) && !/(^|\/)(node_modules|fixtures|dist|build|tests?|__tests__|e2e)\//.test(f.path) && !/\.(test|spec)\.[mc]?[tj]sx?$|(^|\/)test_[^/]+\.py$/.test(f.path));
  const out: Signal[] = [];
  const sample = (hits: string[]) => hits.slice(0, 5).concat(hits.length > 5 ? [`… and ${hits.length - 5} more`] : []);
  const base = { kind: "style-pattern" as const, strength: "speculative" as const, caveat: STYLE_CAVEAT };

  const ph: string[] = [];
  for (const f of code) f.content.split("\n").forEach((l, i) => { PLACEHOLDER.lastIndex = 0; if (PLACEHOLDER.test(l)) ph.push(`${f.path}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  if (ph.length >= 3) out.push(mk({ ...base, ref: "style:placeholder", file: ph[0]!.split(":")[0], title: `${ph.length} placeholder phrases in code`, explanation: "Phrases such as \"TODO: implement\" or \"your code here\" appear several times. They are left behind by templates, tutorials and unfinished human work as often as by generated code.", evidence: sample(ph) }));

  const dense: string[] = [];
  for (const f of code) {
    const lines = f.content.split("\n").filter((l) => l.trim());
    if (lines.length < 40) continue;
    const cm = lines.filter((l) => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
    if (cm / lines.length >= 0.4) dense.push(`${f.path}: ${Math.round((cm / lines.length) * 100)}% comment lines`);
  }
  if (dense.length >= 2) out.push(mk({ ...base, ref: "style:comment-density", file: dense[0]!.split(":")[0], title: `${dense.length} files are unusually comment-dense`, explanation: "Many lines are comments. Teaching material, documented examples and cautious maintainers write like this.", evidence: sample(dense) }));

  const gen: string[] = [];
  for (const f of code) f.content.split("\n").forEach((l, i) => { GENERIC.lastIndex = 0; const m = GENERIC.exec(l); if (m) gen.push(`${f.path}:${i + 1}: ${m[1]}`); });
  if (gen.length >= 4) out.push(mk({ ...base, ref: "style:generic-names", file: gen[0]!.split(":")[0], title: `${gen.length} generically named functions or variables`, explanation: "Names like process_data or foo are common in tutorials, examples and quick scripts.", evidence: sample(gen) }));

  let documented = 0, total = 0;
  const docEv: string[] = [];
  for (const f of code) {
    const lines = f.content.split("\n");
    lines.forEach((l, i) => {
      if (/^\s*(?:async\s+)?def\s+\w+\(/.test(l) || /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+\(/.test(l)) {
        total++;
        const around = (l.trim().startsWith("def") ? lines.slice(i + 1, i + 12) : lines.slice(Math.max(0, i - 12), i)).join("\n");
        if (/Args:|Returns:|@param|@returns/.test(around)) { documented++; if (docEv.length < 5) docEv.push(`${f.path}:${i + 1}`); }
      }
    });
  }
  if (total >= 8 && documented / total >= 0.9) out.push(mk({ ...base, ref: "style:boilerplate-docs", file: docEv[0]?.split(":")[0], title: `${documented} of ${total} functions have templated Args/Returns docs`, explanation: "Every function carries the same documentation template. Style guides and doc-generation tools enforce this for human code as well.", evidence: docEv }));
  return out;
}

export function detectAll(input: AuthorshipInput): Signal[] {
  return [
    ...detectCommitSignals(input.commits),
    ...detectToolFiles(input.paths),
    ...detectReadmeStatements(input.files),
    ...detectHistoryPatterns(input.commits),
    ...detectStylePatterns(input.files),
  ];
}
