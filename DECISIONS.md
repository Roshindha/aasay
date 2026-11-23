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

- **F1 Forbidden name.** `PLAN.md` (the user-supplied spec) contains the former name and the plan's layout used a directory name derived from it. The detector modules live in `src/lanes/` instead of `src/scouts/`. `PLAN.md` itself is the only file excluded from the forbidden-name check; it is left unedited because it is the user's spec.
- **F2 Versions.** Pinned `typescript@5` (not 7), `eslint@9`, `vitest@3` for compatibility with `eslint-config-next@16`; `@types/node@22`. `diff@8`.
- **F3 Registry 404 semantics.** A 404 for a scoped package, or any lookup when a custom registry is configured (`.npmrc` registry / `.npmrc` scope registry, `pip.conf`/`--index-url`/`[[tool.poetry.source]]`), is `likely`, not `confirmed`.
- **F4 Patch application.** Gate uses `git apply` in a temp dir (fallback `patch -p1`); diffs are generated with the `diff` package.
- **F5 Tests of MCP.** The stdio test spawns the server through `tsx` and talks to it with the SDK client.
- **F6 Local Python modules.** Any file stem or directory name inside the scanned repo counts as a local module (covers sibling and src-layout imports); this can mask a third-party import that shares a name with a repo directory.
- **F7 OpenAI host.** The user rule "outbound HTTP only to api.github.com, registry.npmjs.org, pypi.org" conflicts with using the `openai` SDK (it must reach `api.openai.com`). Resolution: the OpenAI client is opt-in only (`ASSAY_LLM=openai` **and** `OPENAI_API_KEY`), off by default, and its transport is pinned to `api.openai.com` by a separate check in `src/core/llm.ts`. The data allowlist in `src/core/allowlist.ts` is unchanged and contains only the three hosts. LLM-proposed findings are always labelled `speculative`. Flagged in the final report.
- **F8 Lane naming.** Detector lanes live in `src/lanes/`; the heuristic lanes are deterministic and the LLM adds only `speculative` findings.
- **F9 Seeded benchmark.** 11 planted bugs (3 hallucination, 3 spec-drift, 3 test-theater, 2 phantom-dependency) in `fixtures/seeded-demo`; the detectors were written alongside the fixture so the 100% score shows plumbing works, not real-world accuracy. Line tolerance 1. Gate: recall >= 0.8, precision >= 0.8, critical recall = 1.0.
- **F10 Non-planted deps behaviour.** Typosquat and transitive-only detection are implemented and unit-tested but intentionally not planted in the seeded demo (the plan specifies exactly two planted phantom bugs).
