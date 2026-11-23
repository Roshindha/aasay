import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as seededRoute } from "@/app/api/seeded/route";
import { POST as liveRoute } from "@/app/api/live/route";
import { scanLocal, scanView } from "@/core/service";

const uniq = () => `zz-ghost-${Math.random().toString(36).slice(2, 10)}`;
let dir: string;
const saved = process.env.ASSAY_OFFLINE;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "assay-off-")); delete process.env.ASSAY_OFFLINE; });
afterEach(() => { if (saved === undefined) delete process.env.ASSAY_OFFLINE; else process.env.ASSAY_OFFLINE = saved; vi.unstubAllGlobals(); fs.rmSync(dir, { recursive: true, force: true }); });

function project(importName: string) {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p", dependencies: {} }));
  fs.writeFileSync(path.join(dir, "a.ts"), `import x from "${importName}";\nexport default x;\n`);
}

describe("scan.offline", () => {
  it("seeded route reports offline: true", async () => {
    const body = await (await seededRoute()).json();
    expect(body.offline).toBe(true);
  });

  it("is false when a registry lookup really goes to the network", async () => {
    const name = uniq(); project(name);
    const calls: string[] = [];
    const view = scanView(await scanLocal(dir, { registryFetch: async (u) => { calls.push(u); return new Response("nf", { status: 404 }); } }));
    expect(calls).toHaveLength(1);
    expect(view.offline).toBe(false);
  });

  it("is true when the offline option is set, and no lookup is attempted", async () => {
    project(uniq());
    const calls: string[] = [];
    const view = scanView(await scanLocal(dir, { offline: true, registryFetch: async (u) => { calls.push(u); return new Response("", { status: 404 }); } }));
    expect(calls).toHaveLength(0);
    expect(view.offline).toBe(true);
  });

  it("is true when ASSAY_OFFLINE=1, even if online was requested", async () => {
    process.env.ASSAY_OFFLINE = "1"; project(uniq());
    const calls: string[] = [];
    const view = scanView(await scanLocal(dir, { registryFetch: async (u) => { calls.push(u); return new Response("", { status: 404 }); } }));
    expect(calls).toHaveLength(0);
    expect(view.offline).toBe(true);
  });

  it("is true in online mode when every answer came from fixtures/snapshot (no network used)", async () => {
    project("express-validator-pro"); // answered by recorded fixture
    const calls: string[] = [];
    const view = scanView(await scanLocal(dir, { registryFetch: async (u) => { calls.push(u); return new Response("", { status: 404 }); } }));
    expect(calls).toHaveLength(0);
    expect(view.offline).toBe(true);
  });
});

describe("live route", () => {
  function stubGithub(onRegistry: (u: string) => void) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.hostname === "registry.npmjs.org") { onRegistry(url); return new Response("nf", { status: 404 }); }
      if (u.pathname === "/repos/o/r") return json({ default_branch: "main" });
      if (u.pathname === "/repos/o/r/git/trees/main") return json({ sha: "abc", tree: [{ path: "package.json", type: "blob", size: 10 }, { path: "a.ts", type: "blob", size: 10 }] });
      if (u.pathname === "/repos/o/r/contents/package.json") return new Response(`{"name":"p"}`);
      if (u.pathname === "/repos/o/r/contents/a.ts") return new Response(`import x from "${process.env.__GHOST}";\nexport default x;\n`);
      return new Response("nf", { status: 404 });
    }));
  }
  const post = () => liveRoute(new Request("http://x/api/live", { method: "POST", body: JSON.stringify({ url: "https://github.com/o/r" }) }));

  it("reports offline: false when registry lookups hit the network", async () => {
    process.env.__GHOST = uniq();
    const hits: string[] = []; stubGithub((u) => hits.push(u));
    const body = await (await post()).json();
    expect(hits.length).toBeGreaterThan(0);
    expect(body.offline).toBe(false);
    expect(body.source).toBe("github");
  });

  it("reports offline: true under ASSAY_OFFLINE=1 and never contacts a registry", async () => {
    process.env.ASSAY_OFFLINE = "1"; process.env.__GHOST = uniq();
    const hits: string[] = []; stubGithub((u) => hits.push(u));
    const body = await (await post()).json();
    expect(hits).toEqual([]);
    expect(body.offline).toBe(true);
  });
});
