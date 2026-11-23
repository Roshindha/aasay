import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");

function vars(selector: RegExp): Record<string, string> {
  const block = selector.exec(css)![1]!;
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const dark = vars(/:root\s*\{([^}]*)\}/);
const light = { ...dark, ...vars(/:root\[data-theme="light"\]\s*\{([^}]*)\}/) };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const resolve = (t: Record<string, string>, name: string): string => { const v = t[name]!; return v.startsWith("var(") ? resolve(t, v.slice(6, -1)) : v; };

const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-2"], ["text-muted", "bg"], ["text-muted", "surface"], ["text-muted", "surface-2"],
  ["confirmed-fg", "confirmed-bg"], ["likely-fg", "likely-bg"], ["speculative-fg", "speculative-bg"], ["pass-fg", "pass-bg"],
  ["confirmed-fg", "surface"], ["likely-fg", "surface"], ["speculative-fg", "surface"], ["pass-fg", "surface"],
  ["link", "surface"], ["link", "bg"], ["text", "code-bg"], ["text", "add-bg"], ["text", "del-bg"],
];
const GRAPHIC_PAIRS: Array<[string, string]> = [["focus", "bg"], ["focus", "surface"], ["confirmed-solid", "surface"], ["likely-solid", "surface"], ["speculative-solid", "surface"], ["border", "bg"]];

describe.each([["dark", dark], ["light", light]] as const)("%s theme contrast (WCAG 2.1 AA)", (_n, t) => {
  it.each(TEXT_PAIRS)("text %s on %s >= 4.5:1", (fg, bg) => {
    expect(contrast(resolve(t, fg), resolve(t, bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC_PAIRS.filter(([a]) => a !== "border"))("non-text %s on %s >= 3:1", (fg, bg) => {
    expect(contrast(resolve(t, fg), resolve(t, bg))).toBeGreaterThanOrEqual(3);
  });
});
