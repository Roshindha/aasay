# Assay — Implementation Plan (awaiting approval)

No code is written until this plan is approved.

## Open questions (please answer; defaults in brackets)

1. **Location.** `/Users/roshinisudhakar/assay` is an empty *file*, not a directory. [Default: build in `~/assay-app/`; or tell me to delete that file and use `~/assay`.]
2. **"Existing project called Scout."** I have no access to its source. [Default: build from scratch from this spec. If you want a real fork, give me a path/URL — but I'd still rename everything.]
3. **OpenAI usage.** Which model, and is `OPENAI_API_KEY` available? [Default: all LLM calls go through one `LlmClient` interface; seeded/offline runs and tests use a deterministic heuristic/fixture client, so the demo, `pnpm test` and `pnpm build` need no key or network. Model configurable via `ASSAY_MODEL`.]
4. **Seeded benchmark.** The existing benchmark/answer key isn't available. [Default: I author a small seeded demo repo (~10 files, TS + Python) with planted bugs: ~3 per existing lane + 2 phantom-dependency bugs, with an `answer-key.json`.]
5. **Top-500 package fixtures.** No network assumed for dev. [Default: bundle a curated list (a few hundred real popular names per registry that I know offhand, not a verified top-500) and document that it's a snapshot to be refreshed by a script `scripts/refresh-popular.ts`. Say if you need an exact top 500 and I'll fetch it.]
6. **Manifests/lockfiles.** [Default: `package.json` (deps, devDeps, peer, optional), `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`; Python: `requirements*.txt`, `pyproject.toml` (PEP 621 + poetry), `Pipfile`, `poetry.lock`. Node builtins, relative imports, `node:` prefix, tsconfig path aliases, and the Python stdlib are treated as declared. Python import→distribution name mapping (e.g. `yaml`→`PyYAML`, `PIL`→`Pillow`) via a small bundled table.]
7. **Typosquat definition.** [Default: Damerau-Levenshtein ≤ 2 against the top-500 list, only when the name is *not* itself in the list, ignoring scope for `@scope/pkg` comparisons on the full name; names of length < 4 skipped to avoid noise. Existing-but-lookalike → "likely"; nonexistent → "confirmed" regardless.]
8. **Live repo scan.** [Default: GitHub API via `GITHUB_TOKEN` (optional) fetching tree + changed files for a PR URL or a repo's default-branch files (capped by file count/size). Only `api.github.com` plus the two registry hosts are allowed.]
9. **Package manager version.** Local pnpm is 8.9.2; Next 16 may want newer. [Default: use pnpm 8.9.2 if it works, else note it.]
10. **Git.** Not a repo yet. [Default: `git init`, one commit per stage; no remote/push.]
11. **Auth/hosting.** [Default: local-only app, no auth.]

## Stack & layout

Next.js 16 (App Router) + React 19 + strict TS + Tailwind + Zod + Vitest; `@modelcontextprotocol/sdk` stdio server; `openai` SDK.

```
src/
  core/        types (Zod schemas), pipeline orchestration, token estimator, cache keys
  scouts/      hallucination, spec-drift, test-theater (heuristics + optional LLM), phantom-dependency
  deps/        parser (ts/js, python), manifest resolver, registry client (allowlist, disk cache, offline), typosquat, popular fixtures
  judge/       dedupe, confidence labelling, seeded-metrics vs live-summary separation
  graph/       evidence graph builder
  patches/     candidate generators (conservative/idiomatic/robust), scoring, import remove/replace
  gate/        temp-dir diff apply, sanitized env, check runner
  github/      allowlisted fetcher
  mcp/         server (stdio), tools, resources, prompts
  app/         Next UI: Seeded runs, Live scan, Verdicts, Evidence graph, Tournament, Handoffs, Dependencies panel, Context-budget telemetry
fixtures/      seeded-demo repo, answer-key.json, registry-responses/, popular-{npm,pypi}.json
tests/
```

## Stages (one commit each; tests run after each)

1. **Scaffold** — Next/TS strict/Tailwind/Vitest, Zod core types, lint, smoke test.
2. **Parser** — TS/JS imports (`import`, `import()`, `require`, `export … from`, type imports) and Python (`import x`, `from x import y`, relative skipped) with line numbers; specifier→package name normalization. Tests for both.
3. **Resolver** — manifest/lockfile resolution; registry client with host allowlist (`registry.npmjs.org`, `pypi.org`), disk cache, offline fixtures mode; typosquat matcher. Tests with mocked HTTP.
4. **Judge integration** — remaining three lanes, phantom lane emitting findings (file, line, specifier, registry status), judge dedupe/labels, seeded eval (recall, precision, critical recall, gate status) with the 2 planted phantom bugs + answer key; evidence graph data.
5. **Gate & patches** — tournament candidates incl. remove/replace bad import; scoring on 5 axes; gate applies unified diffs in a temp dir, strips secrets from env (allowlist-based env, test asserts no `*KEY*/*TOKEN*/*SECRET*` leaks), non-applying → ineligible. Tests incl. rejecting a non-applying patch.
6. **UI** — existing control surface + Dependencies panel + context-budget telemetry (inspected files, est. tokens ≈ chars/4, cache keys).
7. **MCP** — tools `assay_review`, `assay_fix`, `assay_score_patch`, `assay_handoff`, `assay_eval`, `assay_check_deps`; resources (findings, evidence graph, answer key); prompts (review, fix handoff). Server name `assay`. Stdio test.
8. **Docs** — README (setup, MCP client config snippet, Phantom Dependency lane), a grep test/CI check that the forbidden former name never appears in the repo (I will avoid spelling it in source, including the test, by building the pattern from char codes).

## Acceptance checks
`pnpm build`, `pnpm test`, seeded eval output showing both phantom bugs found, secrets test, forbidden-name grep, README sections.

## Known risks
- Heuristic scouts will be simpler than an LLM-backed ones; seeded benchmark is self-authored, so metrics demonstrate plumbing, not real-world accuracy.
- Top-500 fixtures are approximate unless you want me to fetch them.
- Gate "checks" run only tooling present in the target (e.g. `tsc`/tests if configured); otherwise just apply-check.
