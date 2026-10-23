/** Percentage saved, rounded; negative when the output grew. */
export function savedPercent(original: number, now: number): number {
  return original > 0 ? Math.round(((original - now) / original) * 100) : 0;
}

export function totals(rows: readonly { originalSize: number; newSize: number }[]): { original: number; now: number; percent: number } {
  const original = rows.reduce((n, r) => n + r.originalSize, 0);
  const now = rows.reduce((n, r) => n + r.newSize, 0);
  return { original, now, percent: savedPercent(original, now) };
}
