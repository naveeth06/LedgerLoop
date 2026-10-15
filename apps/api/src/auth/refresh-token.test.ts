import { describe, expect, it } from 'vitest';
import { createRefreshToken, hashRefreshToken } from './refresh-token';

describe('refresh token helpers', () => {
  it('creates opaque high-entropy tokens and stores only a stable digest', () => {
    const token = createRefreshToken();
    expect(token).not.toBe(createRefreshToken());
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashRefreshToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});
