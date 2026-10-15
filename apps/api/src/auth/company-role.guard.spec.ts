import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { CompanyRoleGuard } from './company-role.guard';

function contextFor(userId: string, companyId: string) {
  const request: Record<string, unknown> = {
    user: { sub: userId },
    params: { companyId },
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('CompanyRoleGuard', () => {
  const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
  const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

  it('does not perform membership lookups when no role is required', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const tenantAccess = { withCompanyTransaction: vi.fn() };
    const guard = new CompanyRoleGuard(reflector as never, tenantAccess as never);

    expect(await guard.canActivate(contextFor(userId, companyId).context)).toBe(true);
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('allows a required role only when the active membership has it', async () => {
    const membership = { id: 'membership-id', company_id: companyId, user_id: userId, role: 'admin' };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['owner', 'admin']) };
    const tenantAccess = {
      withCompanyTransaction: vi.fn(async (_user: string, _company: string, work: (client: unknown, member: typeof membership) => unknown) =>
        work({}, membership)),
    };
    const guard = new CompanyRoleGuard(reflector as never, tenantAccess as never);
    const { context, request } = contextFor(userId, companyId);

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.companyMembership).toEqual(membership);
  });

  it('rejects active members with insufficient privileges', async () => {
    const membership = { id: 'membership-id', company_id: companyId, user_id: userId, role: 'viewer' };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['owner', 'admin']) };
    const tenantAccess = {
      withCompanyTransaction: vi.fn(async (_user: string, _company: string, work: (client: unknown, member: typeof membership) => unknown) =>
        work({}, membership)),
    };
    const guard = new CompanyRoleGuard(reflector as never, tenantAccess as never);

    await expect(guard.canActivate(contextFor(userId, companyId).context)).rejects.toThrow(
      'Your company role does not permit this action.',
    );
  });
});
