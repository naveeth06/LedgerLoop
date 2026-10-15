import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertSafeStatementText } from './statement-import-security';

describe('statement import security', () => {
  it('accepts normal statement text', () => {
    expect(assertSafeStatementText('UPI payment - Cafe\t123', 'description')).toBe('UPI payment - Cafe\t123');
  });

  it('rejects embedded control characters', () => {
    expect(() => assertSafeStatementText('safe\u0000payload', 'description')).toThrow(BadRequestException);
  });

  it('allows line breaks used by bank descriptions', () => {
    expect(assertSafeStatementText('Bank\r\nNarration', 'description')).toBe('Bank\r\nNarration');
  });
});
