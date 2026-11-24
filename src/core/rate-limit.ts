/** Small in-memory limiter: at most `max` hits per `windowMs` for each key (e.g. a client IP). */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): { ok: boolean; retryAfterSec: number } => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.ceil((recent[0]! + windowMs - t) / 1000) };
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  };
}
