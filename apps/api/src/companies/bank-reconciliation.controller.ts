import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const matchSchema = z.object({ journalLineId: z.string().uuid() }).strict();

@Controller('companies/:companyId/bank-accounts/:bankAccountId/reconciliation')
export class BankReconciliationController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('suggestions/:transactionId')
  async suggestions(
    @Param('companyId') companyId: string,
    @Param('bankAccountId') bankAccountId: string,
    @Param('transactionId') transactionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const transaction = await client.query(
        `SELECT bst.id, bst.transaction_date AS "transactionDate", bst.transaction_type AS "transactionType", bst.amount_paise::text AS "amountPaise", bst.description, bst.reference, bst.status, ba.ledger_account_id AS "ledgerAccountId"
         FROM bank_statement_transactions bst
         JOIN bank_accounts ba ON ba.company_id = bst.company_id AND ba.id = bst.bank_account_id
         WHERE bst.company_id = $1 AND bst.bank_account_id = $2 AND bst.id = $3`,
        [companyId, bankAccountId, transactionId],
      );
      const txn = transaction.rows[0];
      if (!txn) throw new BadRequestException('Bank statement transaction was not found.');
      if (txn.status !== 'unreconciled') throw new BadRequestException('Only unreconciled transactions can be matched.');

      const journalSide = txn.transactionType === 'debit' ? 'credit_paise' : 'debit_paise';
      const result = await client.query(
        `SELECT jl.id AS "journalLineId", je.id AS "journalEntryId", je.entry_number AS "entryNumber", je.entry_date AS "entryDate", je.memo,
                jl.description AS "lineDescription", jl.debit_paise::text AS "debitPaise", jl.credit_paise::text AS "creditPaise",
                ABS(je.entry_date - $3::date) AS "dayDistance",
                CASE
                  WHEN je.entry_date = $3::date THEN 1.00
                  WHEN ABS(je.entry_date - $3::date) = 1 THEN 0.90
                  WHEN ABS(je.entry_date - $3::date) = 2 THEN 0.80
                  ELSE 0.70
                END AS confidence,
                CASE
                  WHEN je.entry_date = $3::date THEN 'high'
                  WHEN ABS(je.entry_date - $3::date) = 1 THEN 'high'
                  WHEN ABS(je.entry_date - $3::date) = 2 THEN 'medium'
                  ELSE 'low'
                END AS "confidenceBand"
         FROM journal_lines jl
         JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
         WHERE jl.company_id = $1
           AND jl.account_id = $2
           AND je.status = 'posted'
           AND je.entry_date BETWEEN ($3::date - INTERVAL '3 days') AND ($3::date + INTERVAL '3 days')
           AND jl.${journalSide} = $4::bigint
           AND NOT EXISTS (
             SELECT 1 FROM bank_statement_transactions bst
             WHERE bst.company_id = jl.company_id
               AND bst.matched_journal_line_id = jl.id
           )
         ORDER BY confidence DESC, "dayDistance" ASC, je.entry_number
         LIMIT 25`,
        [companyId, txn.ledgerAccountId, txn.transactionDate, txn.amountPaise],
      );

      return {
        transaction: txn,
        suggestions: result.rows,
        policy: {
          amountMatchRequired: true,
          accountMatchRequired: true,
          dateWindowDays: 3,
          lowConfidenceAutoPost: false,
        },
      };
    });
  }

  @Post(':transactionId/match')
  @CompanyRoles('owner', 'admin', 'accountant')
  async match(
    @Param('companyId') companyId: string,
    @Param('bankAccountId') bankAccountId: string,
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Journal line match is invalid.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const txnResult = await client.query(
        `SELECT bst.id, bst.status, bst.transaction_type AS "transactionType", bst.amount_paise::text AS "amountPaise", bst.transaction_date AS "transactionDate", ba.ledger_account_id AS "ledgerAccountId"
         FROM bank_statement_transactions bst
         JOIN bank_accounts ba ON ba.company_id = bst.company_id AND ba.id = bst.bank_account_id
         WHERE bst.company_id = $1 AND bst.bank_account_id = $2 AND bst.id = $3
         FOR UPDATE`,
        [companyId, bankAccountId, transactionId],
      );
      const txn = txnResult.rows[0];
      if (!txn) throw new BadRequestException('Bank statement transaction was not found.');
      if (txn.status !== 'unreconciled') throw new BadRequestException('Only unreconciled transactions can be matched.');

      const journalSide = txn.transactionType === 'debit' ? 'credit_paise' : 'debit_paise';
      const lineResult = await client.query(
        `SELECT jl.id AS "journalLineId", jl.journal_entry_id AS "journalEntryId", je.entry_date AS "entryDate"
         FROM journal_lines jl
         JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
         WHERE jl.company_id = $1 AND jl.id = $2 AND jl.account_id = $3 AND je.status = 'posted' AND jl.${journalSide} = $4::bigint
         FOR UPDATE`,
        [companyId, parsed.data.journalLineId, txn.ledgerAccountId, txn.amountPaise],
      );
      const line = lineResult.rows[0];
      if (!line) throw new BadRequestException('Journal line does not match the bank transaction amount and account.');

      const dateResult = await client.query(`SELECT ABS($1::date - $2::date) AS day_distance`, [txn.transactionDate, line.entryDate]);
      if (Number(dateResult.rows[0].day_distance) > 3) throw new BadRequestException('Journal entry is outside the allowed three-day reconciliation window.');

      const existing = await client.query(
        `SELECT id FROM bank_statement_transactions WHERE company_id = $1 AND matched_journal_line_id = $2 FOR UPDATE`,
        [companyId, parsed.data.journalLineId],
      );
      if (existing.rows[0]) throw new BadRequestException('Journal line is already reconciled to another bank transaction.');

      await client.query(
        `UPDATE bank_statement_transactions
         SET status = 'reconciled', matched_journal_line_id = $1, matched_at = now(), matched_by = $2, updated_at = now()
         WHERE company_id = $3 AND id = $4`,
        [parsed.data.journalLineId, userId, companyId, transactionId],
      );

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'BANK_TRANSACTION_RECONCILED',
        entityType: 'bank_statement_transaction',
        entityId: transactionId,
        metadata: { companyId, bankAccountId, journalLineId: parsed.data.journalLineId, journalEntryId: line.journalEntryId },
      });

      return { transactionId, journalLineId: parsed.data.journalLineId, journalEntryId: line.journalEntryId, status: 'reconciled' };
    });
  }
}
