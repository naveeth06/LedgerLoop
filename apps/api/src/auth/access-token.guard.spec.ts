import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';

function contextFor(authorization?: string) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: { authorization },
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AccessTokenGuard', () => {
  it('allows explicitly public handlers without a bearer token', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
    const service = { verify: vi.fn() };
    const guard = new AccessTokenGuard(reflector as never, service as never);
    const { context } = contextFor();

    expect(guard.canActivate(context)).toBe(true);
    expect(service.verify).not.toHaveBeenCalled();
  });

  it('rejects missing and malformed bearer credentials', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const service = { verify: vi.fn() };
    const guard = new AccessTokenGuard(reflector as never, service as never);

    expect(() => guard.canActivate(contextFor().context)).toThrow('A valid bearer access token is required.');
    expect(() => guard.canActivate(contextFor('Basic abc').context)).toThrow('A valid bearer access token is required.');
    expect(service.verify).not.toHaveBeenCalled();
  });

  it('attaches verified claims to the request', () => {
    const claims = {
      sub: 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2',
      iat: 1_800_000_000,
      exp: 1_800_000_900,
      iss: 'ledgerloop-api',
      aud: 'ledgerloop-web',
    };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const service = { verify: vi.fn().mockReturnValue(claims) };
    const guard = new AccessTokenGuard(reflector as never, service as never);
    const { context, request } = contextFor('Bearer signed.token.value');

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual(claims);
    expect(service.verify).toHaveBeenCalledWith('signed.token.value');
  });

  it('rejects tokens the verifier does not accept', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const service = { verify: vi.fn().mockReturnValue(null) };
    const guard = new AccessTokenGuard(reflector as never, service as never);

    expect(() => guard.canActivate(contextFor('Bearer bad.token').context)).toThrow('Access token is invalid or expired.');
  });
});
