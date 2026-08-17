/**
 * Parse an unsigned base-10 integer without accepting trailing characters,
 * exponents, decimals, or values outside JavaScript's safe integer range.
 */
export function parseDecimalInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}