import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, HostNotAllowedError, allowlistedFetch, assertAllowedUrl } from "@/core/allowlist";

describe("outbound host allowlist", () => {
  it("allows exactly the three hosts", () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(["api.github.com", "pypi.org", "registry.npmjs.org"]);
    for (const u of ["https://api.github.com/repos/a/b", "https://registry.npmjs.org/react", "https://pypi.org/pypi/x/json"]) {
      expect(() => assertAllowedUrl(u)).not.toThrow();
    }
  });

  it.each([
    "https://example.com/",
    "https://registry.npmjs.org.evil.com/x",
    "https://evil.com/registry.npmjs.org",
    "https://registry.npmjs.org@evil.com/x",
    "http://registry.npmjs.org/react",
    "https://registry.npmjs.org:8443/react",
    "https://files.pythonhosted.org/x",
    "not a url",
  ])("rejects %s", (u) => {
    expect(() => assertAllowedUrl(u)).toThrow(HostNotAllowedError);
  });

  it("never calls the underlying fetch for blocked hosts", async () => {
    let called = 0;
    await expect(allowlistedFetch("https://example.com", {}, async () => { called++; return new Response("x"); })).rejects.toThrow(HostNotAllowedError);
    expect(called).toBe(0);
  });

  it("rejects redirects to non-allowlisted hosts", async () => {
    const impl = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    await expect(allowlistedFetch("https://pypi.org/pypi/x/json", {}, impl)).rejects.toThrow(HostNotAllowedError);
  });
});
