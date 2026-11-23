import { PY_IMPORT_TO_DIST } from "./python-stdlib";

/** PEP 503 normalization: lower-case, runs of -_. collapse to "-". */
export function normalizePyName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

/** Map a Python top-level import name to the PyPI distribution name. */
export function pyImportToDist(top: string): string {
  const direct = PY_IMPORT_TO_DIST[top] ?? PY_IMPORT_TO_DIST[top.toLowerCase()];
  return direct ?? top;
}

/** Normalize a JS import specifier to its npm package name; returns null for relative/absolute/URL specifiers. */
export function specifierToNpmName(spec: string): string | null {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || /^[a-z]+:\/\//i.test(spec)) return null;
  if (spec.startsWith("node:")) return spec; // kept verbatim; treated as builtin
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2 || !parts[1]) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split("/")[0] ?? null;
}
