# Contributing

Thanks for taking an interest in Assay. This is a stub: it will grow as the project does.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium   # once, for the browser tests
pnpm test && pnpm typecheck && pnpm lint
pnpm build && pnpm e2e
pnpm eval
```

Everything must pass with no network and no API keys. Tests that need HTTP inject a transport; a test-side guard fails any real `fetch`.

## Ground rules

- **The host allowlist is absolute** (`src/core/allowlist.ts`: `api.github.com`, `registry.npmjs.org`, `pypi.org`). A new outbound host needs its own module, its own allowlist entry, tests and a note in `DECISIONS.md`.
- **The authorship audit reports signals; it never conceals them.** Changes that remove, hide, obfuscate or rewrite authorship signals, rewrite history, or help a repository pass as human-written will not be accepted. See `src/authorship/policy.ts`.
- **Detectors need a false-positive story.** A new signal needs a strength, an explanation, a caveat when it is weak, a positive fixture, and a human-written fixture that shows how it can misfire.
- **Record decisions** in `DECISIONS.md` with the next free ID.
- Keep commits small, with a clear message that says what changed and why.

## Adding a lane or a signal

See `docs/ARCHITECTURE.md` for where things live. A lane is a function `(ctx) => Finding[]` registered in `src/core/pipeline.ts`; an authorship signal is a detector in `src/authorship/detect.ts` plus a fixture in `scripts/build-authorship-fixtures.ts`.
