import { BadRequestException, Body, Controller, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../database/audit.service';
import { DatabaseService } from '../database/database.service';
import { TenantAccessService } from '../database/tenant-access.service';
import { withTenantTransaction } from '../database/tenant-transaction';
import { AuthenticatedRequest } from '../auth/current-user';
import { CompanyRoles } from '../auth/roles.decorator';

const createCompanySchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120),
}).strict();

const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  gstin: z.string().trim().regex(/^[0-9A-Z]{15}$/).optional(),
}).strict();

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async createCompany(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Company details are invalid.');

    const companyId = randomUUID();
    return withTenantTransaction(this.database.pool, companyId, async (client) => {
      const inserted = await client.query<{
        id: string; legal_name: string; display_name: string; base_currency: string;
      }>(
        `INSERT INTO companies (id, legal_name, display_name, base_currency)
         VALUES ($1, $2, $3, 'INR')
         RETURNING id, legal_name, display_name, base_currency`,
        [companyId, parsed.data.legalName, parsed.data.displayName],
      );
      const membership = await client.query<{ id: string; role: string }>(
        `INSERT INTO company_memberships (company_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         RETURNING id, role`,
        [companyId, userId],
      );
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'COMPANY_CREATED',
        entityType: 'company',
        entityId: companyId,
        metadata: { displayName: parsed.data.displayName },
      });
      return { company: inserted.rows[0], membership: membership.rows[0] };
    });
  }

  @Post(':companyId/branches')
  @CompanyRoles('owner', 'admin')
  async createBranch(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Branch details are invalid.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const inserted = await client.query<{
        id: string; company_id: string; name: string; code: string; gstin: string | null;
      }>(
        `INSERT INTO branches (company_id, name, code, gstin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, company_id, name, code, gstin`,
        [companyId, parsed.data.name, parsed.data.code, parsed.data.gstin ?? null],
      );
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'BRANCH_CREATED',
        entityType: 'branch',
        entityId: inserted.rows[0].id,
        metadata: { companyId, code: parsed.data.code },
      });
      return { branch: inserted.rows[0] };
    });
  }
}
