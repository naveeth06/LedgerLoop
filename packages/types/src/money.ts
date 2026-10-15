/**
 * Parse a rupee decimal string into integer paise without floating-point math.
 * Accepts non-negative decimal notation with at most two fractional digits.
 */
export function parseRupeesToPaise(value: string): number {
  if (!/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.test(value)) {
    throw new TypeError(
      'Amount must be a non-negative rupee decimal string with at most two fractional digits.',
    );
  }
  const [rupees, fraction = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Amount exceeds the maximum safe integer number of paise.');
  }
  return Number(paise);
}
