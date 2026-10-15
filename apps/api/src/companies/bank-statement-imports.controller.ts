import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const rowSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transactionType: z.enum(['debit', 'credit']),
  amountPaise: z.string().regex(/^[1-9][0-9]{0,17}$/),
  description: z.string().trim().min(1).max(2000),
  reference: z.string().trim().max(200).optional(),
  externalId: z.string().trim().min(1).max(200).optional(),
  balanceAfterPaise: z.string().regex(/^-?[0-9]{1,18}$/).optional(),
}).strict();

const importSchema = z.object({
  sourceName: z.string().trim().max(200).optional(),
  rows: z.array(rowSchema).min(1).max(10000),
}).strict();

@Controller('companies/:companyId/bank-accounts/:bankAccountId/statement-imports')
export class BankStatementImportsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async list(@Param('companyId') companyId: string, @Param('bankAccountId') bankAccountId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT id, transaction_date AS "transactionDate", value_date AS "valueDate", transaction_type AS "transactionType", amount_paise::text AS "amountPaise", description, reference, external_id AS "externalId", balance_after_paise::text AS "balanceAfterPaise", status, matched_journal_line_id AS "matchedJournalLineId", matched_at AS "matchedAt", matched_by AS "matchedBy", import_id AS "importId", created_at AS "createdAt" FROM bank_statement_transactions WHERE company_id = $1 AND bank_account_id = $2 ORDER BY transaction_date DESC, created_at DESC`, [companyId, bankAccountId]);
      return { transactions: result.rows };
    });
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async import(@Param('companyId') companyId: string, @Param('bankAccountId') bankAccountId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Statement import is invalid.');
    const data = parsed.data;

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const account = await client.query('SELECT id FROM bank_accounts WHERE company_id = $1 AND id = $2 AND is_active = true', [companyId, bankAccountId]);
      if (!account.rows[0]) throw new BadRequestException('Bank account is not active or does not belong to this company.');

      const importId = randomUUID();
      await client.query(`INSERT INTO bank_statement_imports (id, company_id, bank_account_id, source_name, imported_by, row_count) VALUES ($1,$2,$3,$4,$5,$6)`, [importId, companyId, bankAccountId, data.sourceName ?? null, userId, data.rows.length]);

      let importedCount = 0;
      let skippedCount = 0;
      for (const row of data.rows) {
        const inserted = await client.query(`INSERT INTO bank_statement_transactions (company_id, bank_account_id, import_id, transaction_date, value_date, transaction_type, amount_paise, description, reference, external_id, balance_after_paise) VALUES ($1,$2,$3,$4::date,$5::date,$6,$7::bigint,$8,$9,$10,$11::bigint) ON CONFLICT (company_id, bank_account_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`, [companyId, bankAccountId, importId, row.transactionDate, row.valueDate ?? null, row.transactionType, row.amountPaise, row.description, row.reference ?? null, row.externalId ?? null, row.balanceAfterPaise ?? null]);
        const rowCount = inserted.rowCount ?? 0;
        if (rowCount > 0) importedCount += rowCount; else skippedCount++;
      }

      await this.audit.record(client, { actorUserId: userId, action: 'BANK_STATEMENT_IMPORTED', entityType: 'bank_statement_import', entityId: importId, metadata: { companyId, bankAccountId, sourceName: data.sourceName ?? null, requestedRows: data.rows.length, importedRows: importedCount, skippedRows: skippedCount } });
      return { importId, importedCount, skippedCount };
    });
  }
}
