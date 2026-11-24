/**
 * Regenerates fixtures/authorship/*.json and answer-key.json. Fixtures are JSON (not real nested repos) so that tool files such as
 * CLAUDE.md do not exist as real files inside this repository. Run: pnpm exec tsx scripts/build-authorship-fixtures.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface Commit { sha: string; message: string; authorName: string; authorEmail: string; date: string; additions?: number; deletions?: number }
interface Case { id: string; description: string; humanWritten: boolean; paths: string[]; files: Array<{ path: string; content: string }>; commits: Commit[] }
interface Expect { id: string; humanWritten: boolean; expectedStatus: string; expectedOverall: string; expectedSignals: string[]; expectedSpeculative: string[]; note: string }

const sha = (id: string, i: number) => crypto.createHash("sha1").update(`${id}:${i}`).digest("hex");
const s7 = (id: string, i: number) => sha(id, i).slice(0, 7);
const day = (n: number, min = 0) => new Date(Date.UTC(2026, 0, 1 + n, 10, min)).toISOString();
const human = { authorName: "Sam Rivera", authorEmail: "sam@example.com" };
const cm = (id: string, i: number, message: string, date: string, extra: Partial<Commit> = {}): Commit => ({ sha: sha(id, i), message, ...human, date, additions: 40, deletions: 5, ...extra });
const plainHistory = (id: string, n = 6): Commit[] => Array.from({ length: n }, (_, i) => cm(id, i, ["initial version", "fix off-by-one", "add tests", "tidy readme", "handle empty input", "bump version"][i % 6]!, day(i * 3)));
const readme = (extra = "") => `# Project\n\nA small command-line tool.\n\n## Usage\n\nRun it.\n${extra}`;
const code = (name: string) => ({ path: name, content: "def add(a, b):\n    return a + b\n" });

const cases: Case[] = [];
const expects: Expect[] = [];
const add = (c: Case, e: Omit<Expect, "id" | "humanWritten">) => { cases.push(c); expects.push({ id: c.id, humanWritten: c.humanWritten, ...e }); };

{ // 1 AI-assisted and disclosed
  const id = "ai-disclosed";
  const commits = plainHistory(id, 5);
  commits[2]!.message += "\n\nCo-Authored-By: Claude <noreply@anthropic.com>";
  commits[4]!.message += "\n\nCo-Authored-By: Claude <noreply@anthropic.com>";
  add({ id, description: "AI-assisted (Claude Code) and the README says so.", humanWritten: false, paths: ["CLAUDE.md", "README.md", "src/app.py", "tests/test_app.py"],
    files: [{ path: "README.md", content: readme("\n## How this was built\n\nThis project was built with Claude Code. I reviewed and tested every change.\n") }, code("src/app.py")], commits },
  { expectedStatus: "disclosed", expectedOverall: "clear", expectedSignals: ["tool-file:CLAUDE.md", `commit-trailer:${s7(id, 2)}`, `commit-trailer:${s7(id, 4)}`, "readme:ai"], expectedSpeculative: [], note: "Strong signals and an accurate README disclosure." });
}
{ // 2 AI-assisted and undisclosed (burst of large commits too)
  const id = "ai-undisclosed";
  const commits = plainHistory(id, 3);
  commits[1]!.message += "\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)";
  for (let i = 0; i < 6; i++) commits.push(cm(id, 10 + i, `add module ${i}`, day(30, i * 4), { additions: 450, deletions: 20 }));
  add({ id, description: "AI-assisted with Cursor and Claude Code; README says nothing.", humanWritten: false, paths: [".cursorrules", ".cursor/rules/style.mdc", "README.md", "src/app.py"],
    files: [{ path: "README.md", content: readme() }, code("src/app.py")], commits },
  { expectedStatus: "undisclosed", expectedOverall: "action-needed", expectedSignals: ["tool-file:.cursorrules", "tool-file:.cursor/", `commit-trailer:${s7(id, 1)}`, "history:burst"], expectedSpeculative: [], note: "Strong signals, no disclosure; a burst of large commits as moderate evidence." });
}
{ // 3 claims hand-written but has CLAUDE.md
  const id = "claims-handwritten-has-claude";
  add({ id, description: "README says 100% hand-written but CLAUDE.md is committed.", humanWritten: false, paths: ["CLAUDE.md", "README.md", "src/app.py"],
    files: [{ path: "README.md", content: readme("\n100% hand-written. No AI was used.\n") }, code("src/app.py")], commits: plainHistory(id) },
  { expectedStatus: "mismatch", expectedOverall: "action-needed", expectedSignals: ["tool-file:CLAUDE.md", "readme:human"], expectedSpeculative: [], note: "Disclosure mismatch." });
}
{ // 4 human, clean
  const id = "human-clean";
  add({ id, description: "Human-written, no signals at all.", humanWritten: true, paths: ["README.md", "src/app.py"], files: [{ path: "README.md", content: readme() }, code("src/app.py")], commits: plainHistory(id) },
  { expectedStatus: "none-found", expectedOverall: "clear", expectedSignals: [], expectedSpeculative: [], note: "Nothing found; not proof of anything." });
}
{ // 5 human, false-positive style: dense comments + placeholders
  const id = "human-fp-comments";
  const dense = (n: string) => ({ path: n, content: Array.from({ length: 60 }, (_, i) => (i % 2 ? `x${i} = ${i}` : `# step ${i}: explained for students`)).join("\n") + "\n" });
  const todo = { path: "src/stubs.py", content: ["def a():", "    pass  # TODO", "def b():", "    raise NotImplementedError", "def c():", "    # TODO: implement", "    pass"].join("\n") + "\n" };
  add({ id, description: "Human-written teaching code: very comment-dense, with deliberate TODO placeholders.", humanWritten: true, paths: ["README.md", "lessons/one.py", "lessons/two.py", "src/stubs.py"],
    files: [{ path: "README.md", content: readme() }, dense("lessons/one.py"), dense("lessons/two.py"), todo], commits: plainHistory(id) },
  { expectedStatus: "none-found", expectedOverall: "clear", expectedSignals: [], expectedSpeculative: ["style:comment-density", "style:placeholder"], note: "False-positive style signals must stay speculative and leave the result clear." });
}
{ // 6 human, false-positive history: big import, uniform conventional commits, dependabot, human co-author
  const id = "human-fp-history";
  const commits: Commit[] = [cm(id, 0, "chore: import project from old repository\n\n- move sources\n- keep history notes", day(0), { additions: 6200, deletions: 0 })];
  for (let i = 1; i <= 10; i++) commits.push(cm(id, i, `feat(core): change ${i}\n\n- adjust handler ${i}\n- update tests`, day(i * 5), { additions: 30, deletions: 4 }));
  commits.push({ sha: sha(id, 99), message: "build(deps): bump left-pad", authorName: "dependabot[bot]", authorEmail: "49699333+dependabot[bot]@users.noreply.github.com", date: day(70), additions: 2, deletions: 2 });
  commits.push(cm(id, 98, "docs: thanks\n\nCo-Authored-By: Jane Doe <jane@example.com>", day(71)));
  add({ id, description: "Human-written project imported in one commit, with templated conventional-commit messages, a dependency bot and a human co-author.", humanWritten: true, paths: ["README.md", "src/app.py"],
    files: [{ path: "README.md", content: readme() }, code("src/app.py")], commits },
  { expectedStatus: "none-found", expectedOverall: "clear", expectedSignals: [], expectedSpeculative: ["history:large-initial", "history:uniform-messages"], note: "Bots and human co-authors are not AI signals; history shape stays speculative." });
}
{ // 7 human, false-positive names + docs, claims hand-written
  const id = "human-fp-names";
  const fn = (i: number) => `def step_${i}(a):\n    """Tutorial step.\n\n    Args:\n        a: input\n    Returns:\n        output\n    """\n    return a\n`;
  const doc = '    """Example.\n\n    Args:\n        x: input\n    Returns:\n        output\n    """';
  const names = ["def process_data(x):", doc, "    return x", "def handle_data(x):", doc, "    return x", "def foo(x):", doc, "    return 1", "def bar(x):", doc, "    return 2", ""].join("\n");
  add({ id, description: "Human-written tutorial: generic names, templated docstrings, and a README that says hand-written.", humanWritten: true, paths: ["README.md", "tutorial/steps.py", "tutorial/names.py"],
    files: [{ path: "README.md", content: readme("\nThis tutorial is hand-written.\n") }, { path: "tutorial/steps.py", content: Array.from({ length: 9 }, (_, i) => fn(i)).join("\n") }, { path: "tutorial/names.py", content: names }], commits: plainHistory(id) },
  { expectedStatus: "none-found", expectedOverall: "clear", expectedSignals: ["readme:human"], expectedSpeculative: ["style:generic-names", "style:boilerplate-docs"], note: "Unverifiable human claim; style signals stay speculative." });
}
{ // 8 mixed
  const id = "mixed";
  const commits = plainHistory(id, 12);
  commits[3]!.message += "\n\nCo-authored-by: Copilot <copilot@github.com>";
  commits[7]!.message += "\n\nCo-authored-by: Copilot <copilot@github.com>";
  add({ id, description: "Partly AI-assisted (Copilot); README admits AI help but does not name the tool.", humanWritten: false, paths: [".github/copilot-instructions.md", "README.md", "src/app.py"],
    files: [{ path: "README.md", content: readme("\nParts of this project were AI-assisted.\n") }, code("src/app.py")], commits },
  { expectedStatus: "disclosed", expectedOverall: "needs-review", expectedSignals: ["tool-file:.github/copilot-instructions.md", `commit-trailer:${s7(id, 3)}`, `commit-trailer:${s7(id, 7)}`, "readme:ai"], expectedSpeculative: [], note: "Disclosed, but the detected tool is not named: needs review." });
}
{ // 9 AI use stated, nothing detectable
  const id = "ai-readme-only";
  add({ id, description: "AI-assisted per the README, with no traces in files or commits.", humanWritten: false, paths: ["README.md", "src/app.py"],
    files: [{ path: "README.md", content: readme("\nBuilt with ChatGPT and edited by me.\n") }, code("src/app.py")], commits: plainHistory(id) },
  { expectedStatus: "disclosed", expectedOverall: "clear", expectedSignals: ["readme:ai"], expectedSpeculative: [], note: "Owner's own account accepted as the disclosure." });
}

const dir = path.resolve("fixtures/authorship");
for (const c of cases) fs.writeFileSync(path.join(dir, `${c.id}.json`), JSON.stringify(c, null, 1) + "\n");
fs.writeFileSync(path.join(dir, "answer-key.json"), JSON.stringify({ note: "Self-authored: written together with the detectors, so it measures plumbing, not real-world accuracy.", cases: expects }, null, 1) + "\n");
console.log(`wrote ${cases.length} fixtures`);
