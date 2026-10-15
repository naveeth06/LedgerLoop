import { BadRequestException, Controller, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

@Controller('companies/:companyId/journal-entries')
export class JournalReversalsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Post(':entryId/reverse')
  @CompanyRoles('owner', 'admin', 'accountant')
  async reverse(
    @Param('companyId') companyId: string,
    @Param('entryId') entryId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const originalResult = await client.query(
        `SELECT id, entry_number, entry_date, memo, status, source_type, reversal_of_id
           FROM journal_entries
          WHERE company_id = $1 AND id = $2
          FOR UPDATE`,
        [companyId, entryId],
      );
      const original = originalResult.rows[0];
      if (!original) throw new BadRequestException('Journal entry was not found.');
      if (original.status !== 'posted') throw new BadRequestException('Only posted journal entries can be reversed.');
      if (original.reversal_of_id) throw new BadRequestException('A reversal journal cannot itself be reversed.');

      const existing = await client.query(
        'SELECT id FROM journal_entries WHERE company_id = $1 AND reversal_of_id = $2 LIMIT 1',
        [companyId, entryId],
      );
      if (existing.rows[0]) throw new BadRequestException('This journal entry has already been reversed.');

      const linesResult = await client.query(
        `SELECT line_number, account_id, description, debit_paise::text AS debit_paise, credit_paise::text AS credit_paise
           FROM journal_lines
          WHERE company_id = $1 AND journal_entry_id = $2
          ORDER BY line_number`,
        [companyId, entryId],
      );
      if (linesResult.rows.length < 2) throw new BadRequestException('The posted journal has no reversible line set.');

      const reversalEntryId = randomUUID();
      const reversalNumber = `REV-${new Date().getUTCFullYear()}-${reversalEntryId.slice(0, 8).toUpperCase()}`;
      const reversalMemo = `Reversal of ${original.entry_number}${original.memo ? `: ${original.memo}` : ''}`.slice(0, 2000);

      await client.query(
        `INSERT INTO journal_entries
          (id, company_id, entry_number, entry_date, memo, status, source_type, created_by, reversal_of_id)
         VALUES ($1, $2, $3, $4::date, $5, 'draft', 'reversal', $6, $7)`,
        [reversalEntryId, companyId, reversalNumber, original.entry_date, reversalMemo, userId, entryId],
      );

      for (const line of linesResult.rows) {
        await client.query(
          `INSERT INTO journal_lines
            (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise)
           VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::bigint)`,
          [
            companyId,
            reversalEntryId,
            line.line_number,
            line.account_id,
            line.description ? `Reversal: ${line.description}`.slice(0, 500) : 'Reversal',
            line.credit_paise,
            line.debit_paise,
          ],
        );
      }

      const posted = await client.query(
        `UPDATE journal_entries
            SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now()
          WHERE company_id = $1 AND id = $2
        RETURNING id, entry_number, entry_date, memo, status, source_type, reversal_of_id, posted_by, posted_at`,
        [companyId, reversalEntryId, userId],
      );

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'JOURNAL_ENTRY_REVERSED',
        entityType: 'journal_entry',
        entityId: entryId,
        metadata: { companyId, originalEntryNumber: original.entry_number, reversalEntryId, reversalEntryNumber: reversalNumber },
      });
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'JOURNAL_ENTRY_POSTED',
        entityType: 'journal_entry',
        entityId: reversalEntryId,
        metadata: { companyId, entryNumber: reversalNumber, status: 'posted', sourceType: 'reversal', reversalOfId: entryId },
      });

      return { originalEntryId: entryId, reversalEntry: posted.rows[0] };
    });
  }
}
