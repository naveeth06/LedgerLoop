import { afterEach, describe, expect, it } from 'vitest';
import { AccessTokenService } from './access-token.service';

const originalSecret = process.env.AUTH_TOKEN_SECRET;
const originalTtl = process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
  else process.env.AUTH_TOKEN_SECRET = originalSecret;
  if (originalTtl === undefined) delete process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
  else process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = originalTtl;
});

describe('AccessTokenService', () => {
  it('issues a signed token that verifies for the intended user', () => {
    process.env.AUTH_TOKEN_SECRET = 'a'.repeat(48);
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    const service = new AccessTokenService();
    const userId = 'c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11';
    const issued = service.issue(userId);
    expect(issued.expiresIn).toBe(900);
    expect(service.verify(issued.accessToken)?.sub).toBe(userId);
  });

  it('rejects tampered tokens', () => {
    process.env.AUTH_TOKEN_SECRET = 'b'.repeat(48);
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    const service = new AccessTokenService();
    const issued = service.issue('c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11');
    expect(service.verify(issued.accessToken + 'x')).toBeNull();
  });

  it('requires a high-entropy secret length', () => {
    process.env.AUTH_TOKEN_SECRET = 'too-short';
    expect(() => new AccessTokenService()).toThrow(/at least 32 bytes/);
  });
});
