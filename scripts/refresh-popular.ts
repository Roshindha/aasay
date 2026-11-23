/**
 * Refresh fixtures/popular-npm.json (and optionally popular-pypi.json).
 *
 *   pnpm refresh-popular                      # npm via registry.npmjs.org search (popularity-ranked)
 *   pnpm refresh-popular --pypi-file top.json # PyPI from a locally downloaded ranking
 *
 * Only registry.npmjs.org / pypi.org / api.github.com may be contacted (src/core/allowlist.ts).
 * pypi.org has no "top packages" endpoint, so PyPI needs a local file: either {"rows":[{"project":"x"}]}
 * (the format published by the top-pypi-packages project) or a JSON array of names. The script never invents names.
 */
import fs from "node:fs";
import path from "node:path";
import { allowlistedFetch } from "@/core/allowlist";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(flag("--limit") ?? 500);
const out = (name: string, names: string[], note: string) => {
  const file = path.resolve("fixtures", name);
  fs.writeFileSync(file, JSON.stringify({ snapshot: true, generatedAt: new Date().toISOString().slice(0, 10), note, names }, null, 1) + "\n");
  console.log(`wrote ${names.length} names to ${file}`);
};

async function npmTop(): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; names.length < limit && from < 1000; from += 250) {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent("not:deprecated")}&popularity=1.0&quality=0&maintenance=0&size=250&from=${from}`;
    const res = await allowlistedFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`npm search failed: ${res.status}`);
    const j = (await res.json()) as { objects: Array<{ package: { name: string } }> };
    if (!j.objects.length) break;
    for (const o of j.objects) if (!names.includes(o.package.name)) names.push(o.package.name);
  }
  return names.slice(0, limit);
}

const pypiFile = flag("--pypi-file");
if (pypiFile) {
  const raw = JSON.parse(fs.readFileSync(pypiFile, "utf8")) as unknown;
  const names = Array.isArray(raw) ? (raw as string[]) : ((raw as { rows: Array<{ project: string }> }).rows ?? []).map((r) => r.project);
  out("popular-pypi.json", names.slice(0, limit), `Snapshot of ${Math.min(limit, names.length)} names from ${path.basename(pypiFile)}. Refresh with scripts/refresh-popular.ts.`);
} else if (!args.includes("--skip-npm")) {
  out("popular-npm.json", await npmTop(), "Snapshot from the npm registry search endpoint ranked by popularity (not an official top-500 list). Refresh with scripts/refresh-popular.ts.");
  console.log("PyPI list unchanged: pass --pypi-file <ranking.json> to refresh it.");
}
