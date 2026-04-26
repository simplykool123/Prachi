/** Returns true when value is a non-empty, non-whitespace string. */
export function required(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Returns true when value parses to a finite number greater than zero. */
export function positiveNumber(value: string | number | null | undefined): boolean {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && isFinite(n) && n > 0;
}

/** Safe division — returns 0 instead of Infinity/NaN when divisor is 0. */
export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}
