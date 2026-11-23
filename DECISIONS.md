# Decisions

Every default chosen or changed while building from PLAN.md. Numbers match the plan's open questions.

| # | Question | Decision |
|---|----------|----------|
| 1 | Location | Built in `~/assay-app`. The empty file `~/assay` was left untouched. |
| 2 | Existing prior project | Built from scratch from the spec; nothing forked. The former project name is not used anywhere in the repo (see item F1). |
| 3 | OpenAI usage | All LLM calls go through the `LlmClient` interface (`src/core/llm.ts`). Default is a deterministic heuristic client; the OpenAI client is used only if `OPENAI_API_KEY` is set and live mode is requested. Model from `ASSAY_MODEL` (default `gpt-4.1-mini`). Tests/build never use the network. |
| 4 | Seeded benchmark | Self-authored demo repo in `fixtures/seeded-demo` with `fixtures/answer-key.json`. |
| 5 | Top-500 lists | Curated approximate snapshots `fixtures/popular-npm.json` / `popular-pypi.json` (not verified top-500). `scripts/refresh-popular.ts` refreshes them. Marked as snapshots in README and UI. |
| 6 | Manifests | As in the plan. See stage 3 notes below. |
| 7 | Typosquat | Damerau-Levenshtein (OSA) <= 2, only when name not in list, names < 4 chars skipped, scoped names compared on full name. Nonexistent -> confirmed; existing lookalike -> likely. |
| 8 | Live scan | GitHub API (optional `GITHUB_TOKEN`), capped by file count/size. |
| 9 | pnpm | pnpm 8.9.2 works with Next 16.4.6 / React 19.3; no change. |
| 10 | Git | `git init`, one commit per stage, no remote. |
| 11 | Auth | Local only, no auth. |

## Additional decisions

- **F1 Forbidden name.** `PLAN.md` (the user-supplied spec) contains the former name and the plan's layout used a directory name derived from it. The detector modules live in `src/lanes/` instead of the directory name the plan's layout used. `PLAN.md` itself is the only file excluded from the forbidden-name check; it is left unedited because it is the user's spec.
- **F2 Versions.** Pinned `typescript@5` (not 7), `eslint@9`, `vitest@3` for compatibility with `eslint-config-next@16`; `@types/node@22`. `diff@8`.
- **F3 Registry 404 semantics.** A 404 for a scoped package, or any lookup when a custom registry is configured (`.npmrc` registry / `.npmrc` scope registry, `pip.conf`/`--index-url`/`[[tool.poetry.source]]`), is `likely`, not `confirmed`.
- **F4 Patch application.** Gate uses `git apply` in a temp dir (fallback `patch -p1`); diffs are generated with the `diff` package.
- **F5 Tests of MCP.** The stdio test spawns the server through `tsx` and talks to it with the SDK client.
- **F6 Local Python modules.** Any file stem or directory name inside the scanned repo counts as a local module (covers sibling and src-layout imports); this can mask a third-party import that shares a name with a repo directory.
- **F7 OpenAI host.** The user rule "outbound HTTP only to api.github.com, registry.npmjs.org, pypi.org" conflicts with using the `openai` SDK (it must reach `api.openai.com`). Resolution: the OpenAI client is opt-in only (`ASSAY_LLM=openai` **and** `OPENAI_API_KEY`), off by default, and its transport is pinned to `api.openai.com` by a separate check in `src/core/llm.ts`. The data allowlist in `src/core/allowlist.ts` is unchanged and contains only the three hosts. LLM-proposed findings are always labelled `speculative`. Flagged in the final report.
- **F8 Lane naming.** Detector lanes live in `src/lanes/`; the heuristic lanes are deterministic and the LLM adds only `speculative` findings.
- **F9 Seeded benchmark.** 11 planted bugs (3 hallucination, 3 spec-drift, 3 test-theater, 2 phantom-dependency) in `fixtures/seeded-demo`; the detectors were written alongside the fixture so the 100% score shows plumbing works, not real-world accuracy. Line tolerance 1. Gate: recall >= 0.8, precision >= 0.8, critical recall = 1.0.
- **F10 Non-planted deps behaviour.** Typosquat and transitive-only detection are implemented and unit-tested but intentionally not planted in the seeded demo (the plan specifies exactly two planted phantom bugs).
- **F11 Gate checks.** With no install step available in the temp dir, built-in checks are: `git apply --check` + apply, JSON validity for patched `.json`, and `ast.parse` for patched `.py` (skipped if `python3` is absent). Callers may add `checks` (used by the secrets test). A candidate is eligible only if it applies and every check passes. Check subprocesses get an allowlisted env (`PATH LANG LC_ALL TERM TZ SHELL` + `HOME`=temp dir, `CI=1`), and any name matching `KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION` is dropped even if explicitly provided.
- **F12 Scoring.** Five axes in [0,1], weighted correctness .40, safety .20, minimality .15, maintainability .15, testability .10. Correctness is measured, not guessed: the full review is re-run on the patched tree (finding must disappear; −0.3 per new medium+ finding; −0.45 for dangling references to removed imports). Non-applying/failed-check candidates are ineligible and score 0.
- **F13 Patch coverage.** Generators exist for: phantom deps (remove / replace / replace+declare / declare / comment-out), missing exports (alias / rename), invented APIs (replace), constant drift (set to spec), tautological assertions (delete / failing TODO). Signature drift and no-assertion tests intentionally get no auto-patch (need human judgement). Replacement names for phantom packages come from a small hand-curated table (`src/patches/replacements.ts`) plus the typosquat target; the semantic fit of a replacement is not verified.
- **F14 UI.** One-page dashboard (`src/app/dashboard.tsx`) over route handlers `/api/seeded`, `/api/live`, `/api/tournament`. Recall/precision/gate are shown only for the seeded run; live scans show counts only (no answer key). A shared service layer (`src/core/service.ts`) keeps an in-memory store of recent scans, used by both the UI and MCP. `turbopack.root` set in `next.config.mjs` to silence the parent-lockfile warning. The build prints a benign "dynamic filesystem access" tracing warning for the fixtures reader; the app is local-only.
- **F15 GitHub fetch.** PR scans fetch changed reviewable files plus all manifests/specs from the PR head tree (for context); repo scans fetch manifests plus code up to 80 files / 150 KB each. Only `api.github.com` is contacted; `GITHUB_TOKEN` is sent only there.
- **F16 MCP.** `src/mcp/server.ts` (name `assay`, stdio). Tools: assay_review, assay_fix, assay_score_patch, assay_handoff, assay_eval, assay_check_deps. Resources: `assay://findings`, `assay://evidence-graph` (latest scan), `assay://answer-key`. Prompts: `review`, `fix_handoff`. Scans are kept in process memory and addressed by `scanId`. `source=path` reads a local directory the client names (local trust model, capped at 300 files / 200 KB each). The stdio test spawns the server via `tsx` with `ASSAY_OFFLINE=1`.
- **F17 refresh-popular.** npm refreshes via the registry search endpoint (popularity-ranked, allowed host). PyPI has no ranking endpoint on an allowed host, so `--pypi-file` takes a locally downloaded ranking; the script never invents names. Not run in this build (no refresh was needed; fixtures are the hand-curated snapshots).
