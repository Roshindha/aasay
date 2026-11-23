import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { allowlistedFetch, type FetchLike } from "@/core/allowlist";
import type { Registry, RegistryStatus } from "@/core/types";
import { normalizePyName } from "./names";
import { fixturesDir, loadPopular } from "./popular";

export type RegistryMode = "offline" | "online";

export interface RegistryLookup {
  status: RegistryStatus;
  source: "fixture" | "popular-snapshot" | "cache" | "network" | "offline-miss" | "error";
  /** Cache key used (for telemetry) */
  cacheKey: string;
}

export interface RegistryClientOptions {
  mode?: RegistryMode;
  cacheDir?: string;
  fixturesPath?: string;
  fetchImpl?: FetchLike;
  ttlMs?: number;
  now?: () => number;
}

interface FixtureFile { npm?: Record<string, "exists" | "not-found">; pypi?: Record<string, "exists" | "not-found"> }

export function registryCacheKey(registry: Registry, name: string): string {
  const n = registry === "pypi" ? normalizePyName(name) : name.toLowerCase();
  return `${registry}:${n}`;
}

export function registryUrl(registry: Registry, name: string): string {
  if (registry === "npm") return `https://registry.npmjs.org/${name.startsWith("@") ? name.replace("/", "%2F") : name}`;
  return `https://pypi.org/pypi/${encodeURIComponent(normalizePyName(name))}/json`;
}

export class RegistryClient {
  readonly mode: RegistryMode;
  private cacheDir: string;
  private fixtures: FixtureFile;
  private fetchImpl: FetchLike;
  private ttl: number;
  private now: () => number;
  private memo = new Map<string, RegistryLookup>();
  /** Keys consulted, in order, for context-budget telemetry */
  readonly consulted: string[] = [];
  /** Number of lookups that actually went to the network (cache and fixture hits do not count) */
  networkCalls = 0;

  constructor(opts: RegistryClientOptions = {}) {
    this.mode = opts.mode ?? "offline";
    this.cacheDir = opts.cacheDir ?? path.resolve(process.cwd(), ".assay-cache", "registry");
    this.fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
    this.ttl = opts.ttlMs ?? 24 * 3600_000;
    this.now = opts.now ?? Date.now;
    const fp = opts.fixturesPath ?? path.join(fixturesDir(), "registry-responses", "responses.json");
    try { this.fixtures = JSON.parse(fs.readFileSync(fp, "utf8")) as FixtureFile; } catch { this.fixtures = {}; }
  }

  private cacheFile(key: string): string {
    return path.join(this.cacheDir, crypto.createHash("sha256").update(key).digest("hex").slice(0, 40) + ".json");
  }

  private fromFixtures(registry: Registry, name: string): RegistryLookup | null {
    const key = registryCacheKey(registry, name);
    const norm = key.slice(key.indexOf(":") + 1);
    const table = this.fixtures[registry] ?? {};
    const hit = Object.entries(table).find(([k]) => (registry === "pypi" ? normalizePyName(k) : k.toLowerCase()) === norm);
    if (hit) return { status: hit[1], source: "fixture", cacheKey: key };
    try {
      if (loadPopular(registry).names.some((p) => (registry === "pypi" ? normalizePyName(p) : p.toLowerCase()) === norm)) {
        return { status: "exists", source: "popular-snapshot", cacheKey: key };
      }
    } catch { /* snapshot missing: fine */ }
    return null;
  }

  async check(registry: Registry, name: string): Promise<RegistryLookup> {
    const key = registryCacheKey(registry, name);
    const memo = this.memo.get(key);
    if (memo) return memo;
    this.consulted.push(key);
    const res = await this.checkUncached(registry, name, key);
    this.memo.set(key, res);
    return res;
  }

  private async checkUncached(registry: Registry, name: string, key: string): Promise<RegistryLookup> {
    const fx = this.fromFixtures(registry, name);
    if (fx) return fx;
    if (this.mode === "offline") return { status: "unknown", source: "offline-miss", cacheKey: key };

    const file = this.cacheFile(key);
    try {
      const c = JSON.parse(fs.readFileSync(file, "utf8")) as { status: RegistryStatus; at: number };
      if (this.now() - c.at < this.ttl) return { status: c.status, source: "cache", cacheKey: key };
    } catch { /* no cache */ }

    try {
      this.networkCalls++;
      const res = await allowlistedFetch(registryUrl(registry, name), { method: "GET", headers: { accept: "application/json" } }, this.fetchImpl);
      const status: RegistryStatus = res.status === 200 ? "exists" : res.status === 404 ? "not-found" : "unknown";
      if (status !== "unknown") {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ status, at: this.now() }));
      }
      return { status, source: "network", cacheKey: key };
    } catch {
      return { status: "unknown", source: "error", cacheKey: key };
    }
  }
}
