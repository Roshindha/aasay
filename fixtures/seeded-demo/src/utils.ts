export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
