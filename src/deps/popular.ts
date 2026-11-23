import fs from "node:fs";
import path from "node:path";
import type { Registry } from "@/core/types";

export interface PopularList { snapshot: true; generatedAt: string; note: string; names: string[] }

const cache = new Map<Registry, PopularList>();

export function fixturesDir(): string {
  return path.resolve(process.cwd(), "fixtures");
}

export function loadPopular(registry: Registry, dir = fixturesDir()): PopularList {
  const key = registry;
  if (dir === fixturesDir() && cache.has(key)) return cache.get(key)!;
  const file = path.join(dir, registry === "npm" ? "popular-npm.json" : "popular-pypi.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8")) as PopularList;
  if (dir === fixturesDir()) cache.set(key, list);
  return list;
}
