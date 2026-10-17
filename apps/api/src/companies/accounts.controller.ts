import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';
import type { AuthenticatedRequest } from '../auth/current-user';
import { CompanyRoles } from '../auth/roles.decorator';

const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

const createAccountSchema = z.object({
  accountCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(160),
  accountType: z.enum(accountTypes),
  parentAccountId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
}).strict();

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(160),
  parentAccountId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).optional(),
}).strict();

@Controller('companies/:companyId/accounts')
export class AccountsController {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async listAccounts(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    const accounts = await this.tenantAccess.withCompanyTransaction(
      userId,
      companyId,
      async (client) => {
        const result = await client.query<{
          id: string;
          company_id: string;
          account_code: string;
          name: string;
          account_type: typeof accountTypes[number];
          parent_account_id: string | null;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
          created_at: Date;
        }>(
          `SELECT id, company_id, account_code, name, account_type, parent_account_id,
                  description, is_system, is_active, created_at
             FROM ledger_accounts
            WHERE company_id = $1
            ORDER BY account_code ASC, id ASC`,
          [companyId],
        );
        return result.rows;
      },
    );
    return { accounts };
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createAccount(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Account details are invalid.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        if (parsed.data.parentAccountId) {
          const parent = await client.query<{ id: string }>(
            'SELECT id FROM ledger_accounts WHERE company_id = $1 AND id = $2 LIMIT 1',
            [companyId, parsed.data.parentAccountId],
          );
          if (!parent.rows[0]) {
            throw new BadRequestException('Parent account must belong to this company.');
          }
        }

        const inserted = await client.query<{
          id: string;
          company_id: string;
          account_code: string;
          name: string;
          account_type: typeof accountTypes[number];
          parent_account_id: string | null;
          description: string | null;
          is_system: boolean;
          is_active: boolean;
          created_at: Date;
        }>(
          `INSERT INTO ledger_accounts
             (company_id, account_code, name, account_type, parent_account_id, description, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, company_id, account_code, name, account_type, parent_account_id,
                     description, is_system, is_active, created_at`,
          [
            companyId,
            parsed.data.accountCode.toUpperCase(),
            parsed.data.name,
            parsed.data.accountType,
            parsed.data.parentAccountId ?? null,
            parsed.data.description ?? null,
            userId,
          ],
        );
        const account = inserted.rows[0];
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'LEDGER_ACCOUNT_CREATED',
          entityType: 'ledger_account',
          entityId: account.id,
          metadata: {
            companyId,
            accountCode: account.account_code,
            accountType: account.account_type,
          },
        });
        return { account };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this code already exists in the company.');
      }
      throw error;
    }
  }

  @Patch(':accountId')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateAccount(
    @Param('companyId') companyId: string,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Account details are invalid.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const existing = await client.query<{
          id: string;
          account_code: string;
          is_system: boolean;
        }>(
          `SELECT id, account_code, is_system
             FROM ledger_accounts
            WHERE company_id = $1 AND id = $2
            LIMIT 1`,
          [companyId, accountId],
        );
        const account = existing.rows[0];
        if (!account) throw new BadRequestException('Account was not found in this company.');
        if (account.is_system) throw new BadRequestException('System accounts cannot be edited.');

        if (parsed.data.parentAccountId) {
          if (parsed.data.parentAccountId === accountId) {
            throw new BadRequestException('An account cannot be its own parent.');
          }
          const parent = await client.query<{ id: string; is_system: boolean }>(
            `SELECT id, is_system
               FROM ledger_accounts
              WHERE company_id = $1 AND id = $2
              LIMIT 1`,
            [companyId, parsed.data.parentAccountId],
          );
          if (!parent.rows[0]) throw new BadRequestException('Parent account must belong to this company.');
        }

        const updated = await client.query(
          `UPDATE ledger_accounts
              SET name = $3,
                  parent_account_id = $4,
                  description = $5
            WHERE company_id = $1 AND id = $2
          RETURNING id, company_id, account_code, name, account_type, parent_account_id,
                    description, is_system, is_active, created_at`,
          [
            companyId,
            accountId,
            parsed.data.name,
            parsed.data.parentAccountId ?? null,
            parsed.data.description?.trim() || null,
          ],
        );
        const updatedAccount = updated.rows[0];
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'LEDGER_ACCOUNT_UPDATED',
          entityType: 'ledger_account',
          entityId: updatedAccount.id,
          metadata: { companyId, accountCode: updatedAccount.account_code },
        });
        return { account: updatedAccount };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('The account update conflicts with an existing account.');
      }
      throw error;
    }
  }

  @Patch(':accountId/status')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateAccountStatus(
    @Param('companyId') companyId: string,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Account status is invalid.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const existing = await client.query<{ id: string; account_code: string; is_system: boolean }>(
        `SELECT id, account_code, is_system
           FROM ledger_accounts
          WHERE company_id = $1 AND id = $2
          LIMIT 1`,
        [companyId, accountId],
      );
      const account = existing.rows[0];
      if (!account) throw new BadRequestException('Account was not found in this company.');
      if (account.is_system) throw new BadRequestException('System accounts cannot be deactivated.');

      const updated = await client.query(
        `UPDATE ledger_accounts
            SET is_active = $3
          WHERE company_id = $1 AND id = $2
        RETURNING id, company_id, account_code, name, account_type, parent_account_id,
                  description, is_system, is_active, created_at`,
        [companyId, accountId, parsed.data.isActive],
      );
      const updatedAccount = updated.rows[0];
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'LEDGER_ACCOUNT_STATUS_UPDATED',
        entityType: 'ledger_account',
        entityId: updatedAccount.id,
        metadata: { companyId, accountCode: updatedAccount.account_code, isActive: updatedAccount.is_active },
      });
      return { account: updatedAccount };
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === '23505';
}
