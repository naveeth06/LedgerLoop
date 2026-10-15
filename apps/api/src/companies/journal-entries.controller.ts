import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const schema = z.object({
  entryNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    description: z.string().trim().max(500).optional(),
    debitPaise: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
    creditPaise: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  }).strict()).min(2).max(500),
  post: z.boolean().default(false),
}).strict().superRefine((entry, context) => {
  let debits = 0n; let credits = 0n;
  entry.lines.forEach((line, index) => {
    const debit = BigInt(line.debitPaise); const credit = BigInt(line.creditPaise);
    if ((debit > 0n) === (credit > 0n)) context.addIssue({ code: 'custom', path: ['lines', index], message: 'Each line must have exactly one positive debit or credit.' });
    debits += debit; credits += credit;
  });
  if (entry.post && (debits === 0n || debits !== credits)) context.addIssue({ code: 'custom', path: ['lines'], message: 'A posted journal must have equal non-zero debit and credit totals.' });
});

@Controller('companies/:companyId/journal-entries')
export class JournalEntriesController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async list(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const entries = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `SELECT e.id, e.company_id, e.entry_number, e.entry_date, e.memo, e.status, e.source_type,
                e.created_by, e.posted_by, e.posted_at, e.created_at, e.updated_at,
                COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'lineNumber', l.line_number,
                  'accountId', l.account_id, 'description', l.description,
                  'debitPaise', l.debit_paise::text, 'creditPaise', l.credit_paise::text)
                  ORDER BY l.line_number) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
           FROM journal_entries e LEFT JOIN journal_lines l ON l.journal_entry_id = e.id AND l.company_id = e.company_id
          WHERE e.company_id = $1 GROUP BY e.id ORDER BY e.entry_date DESC, e.entry_number DESC`,
        [companyId],
      );
      return result.rows;
    });
    return { entries };
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async create(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Journal entry details are invalid or unbalanced.');
    const data = parsed.data; const entryId = randomUUID();
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const inserted = await client.query(
        `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
         VALUES ($1, $2, $3, $4::date, $5, 'draft', 'manual', $6)
         RETURNING id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at, created_at, updated_at`,
        [entryId, companyId, data.entryNumber.toUpperCase(), data.entryDate, data.memo ?? null, userId],
      );
      for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        await client.query(
          'INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::bigint)',
          [companyId, entryId, i + 1, line.accountId, line.description ?? null, line.debitPaise, line.creditPaise],
        );
      }
      let entry = inserted.rows[0];
      if (data.post) {
        const result = await client.query(
          "UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2 RETURNING id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at, created_at, updated_at",
          [companyId, entryId, userId],
        );
        entry = result.rows[0];
      }
      await this.audit.record(client, {
        actorUserId: userId, action: data.post ? 'JOURNAL_ENTRY_POSTED' : 'JOURNAL_ENTRY_CREATED',
        entityType: 'journal_entry', entityId: entryId,
        metadata: { companyId, entryNumber: entry.entry_number, status: entry.status, lineCount: data.lines.length },
      });
      return { entry: { ...entry, lines: data.lines.map((line, index) => ({ lineNumber: index + 1,
        accountId: line.accountId, description: line.description ?? null,
        debitPaise: line.debitPaise, creditPaise: line.creditPaise })) } };
    });
  }
}
