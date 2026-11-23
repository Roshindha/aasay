import { afterEach, expect } from "vitest";

/**
 * Safety net for every test file: a real network request fails loudly instead of being swallowed
 * (the registry client turns network errors into "unknown", which could hide an accidental live call).
 * Every attempt is recorded and any attempt fails the test that made it.
 * Tests that need HTTP inject a transport or `vi.stubGlobal("fetch", …)`, which replaces this guard for that test.
 */
const attempts: string[] = [];
const guard = (async (input: unknown) => {
  const url = typeof input === "string" ? input : (input as { url?: string })?.url ?? String(input);
  attempts.push(url);
  throw new Error(`Network access attempted in a test: ${url}`);
}) as typeof fetch;
globalThis.fetch = guard;

afterEach(() => {
  const made = attempts.splice(0);
  globalThis.fetch = guard;
  expect(made, "tests must not reach the network").toEqual([]);
});
