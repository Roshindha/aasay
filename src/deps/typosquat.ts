/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + cost);
      d[i]![j] = v;
    }
  }
  return d[al]![bl]!;
}

export const TYPOSQUAT_MAX_DISTANCE = 2;
export const TYPOSQUAT_MIN_LENGTH = 4;

export interface TyposquatMatch { target: string; distance: number }

/**
 * Returns the closest popular name within distance <= 2, or null.
 * Skipped when: name is shorter than 4, or name is itself in the popular list.
 * Scoped names are compared on the full "@scope/name" string.
 */
export function findTyposquat(name: string, popular: readonly string[]): TyposquatMatch | null {
  const n = name.toLowerCase();
  if (n.length < TYPOSQUAT_MIN_LENGTH) return null;
  const set = popular instanceof Set ? popular : new Set(popular.map((p) => p.toLowerCase()));
  if (set.has(n)) return null;
  let best: TyposquatMatch | null = null;
  for (const p of popular) {
    const pl = p.toLowerCase();
    if (Math.abs(pl.length - n.length) > TYPOSQUAT_MAX_DISTANCE) continue;
    const dist = damerauLevenshtein(n, pl);
    if (dist <= TYPOSQUAT_MAX_DISTANCE && (!best || dist < best.distance)) best = { target: p, distance: dist };
  }
  return best;
}
