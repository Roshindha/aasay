import { builtinModules } from "node:module";

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));
for (const extra of ["test", "sqlite", "sea"]) BUILTINS.add(extra);

/** True for `fs`, `fs/promises`, `node:anything`. */
export function isNodeBuiltin(spec: string): boolean {
  if (spec.startsWith("node:")) return true;
  const bare = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
  return BUILTINS.has(spec) || BUILTINS.has(bare);
}
