import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const schema = z.object({
  accountName: z.string().trim().min(1).max(160),
  bankName: z.string().trim().min(1).max(160),
  ledgerAccountId: z.string().uuid(),
}).strict();

@Controller('companies/:companyId/bank-accounts')
export class BankAccountsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async list(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT id, account_name AS "accountName", bank_name AS "bankName", ledger_account_id AS "ledgerAccountId", is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt" FROM bank_accounts WHERE company_id = $1 ORDER BY account_name`, [companyId]);
      return { bankAccounts: result.rows };
    });
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async create(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Bank account details are invalid.');
    const data = parsed.data;
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const account = await client.query('SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2', [companyId, data.ledgerAccountId]);
        if (!account.rows[0] || !account.rows[0].is_active || account.rows[0].account_type !== 'asset') throw new BadRequestException('Bank account must use an active asset ledger account in this company.');
        const inserted = await client.query(`INSERT INTO bank_accounts (id, company_id, ledger_account_id, account_name, bank_name, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, account_name AS "accountName", bank_name AS "bankName", ledger_account_id AS "ledgerAccountId", is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`, [randomUUID(), companyId, data.ledgerAccountId, data.accountName, data.bankName, userId]);
        const bankAccount = inserted.rows[0];
        await this.audit.record(client, { actorUserId: userId, action: 'BANK_ACCOUNT_CREATED', entityType: 'bank_account', entityId: bankAccount.id, metadata: { companyId, ledgerAccountId: data.ledgerAccountId } });
        return { bankAccount };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This ledger account is already linked to a bank account.');
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}
