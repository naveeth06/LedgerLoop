import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantAccessService } from '../database/tenant-access.service';
import type { CompanyMembership } from '../database/tenant-transaction';
import { COMPANY_ROLES_KEY, type CompanyRole } from './roles.decorator';
import type { AuthenticatedRequest } from './current-user';

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<CompanyRole[]>(COMPANY_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    const rawCompanyId = request.params.companyId;
    const companyId = typeof rawCompanyId === 'string' ? rawCompanyId : undefined;
    if (!userId || !companyId) {
      throw new ForbiddenException('A company-scoped role and company ID are required.');
    }

    const membership = await this.tenantAccess.withCompanyTransaction<CompanyMembership>(
      userId,
      companyId,
      async (_client, activeMembership) => activeMembership,
    );
    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Your company role does not permit this action.');
    }
    request.companyMembership = membership;
    return true;
  }
}
