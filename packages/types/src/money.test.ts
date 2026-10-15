import { describe, expect, it } from 'vitest';
import { parseRupeesToPaise } from './money.js';

describe('parseRupeesToPaise', () => {
  it.each([
    ['0', 0], ['0.01', 1], ['1', 100], ['1.2', 120], ['1.20', 120], ['123456.78', 12345678],
  ] as const)('converts %s rupees to %i paise', (rupees, expected) => {
    expect(parseRupeesToPaise(rupees)).toBe(expected);
  });

  it.each(['', ' ', '-1', '+1', '01', '1.001', '1.', '.50', '1,000', '1e2'])(
    'rejects invalid amount %j', (value) => {
      expect(() => parseRupeesToPaise(value)).toThrow(TypeError);
    },
  );

  it('rejects amounts that exceed safe integer paise', () => {
    expect(() => parseRupeesToPaise('90071992547410')).toThrow(RangeError);
  });
});
