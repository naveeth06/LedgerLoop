import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const accountSchema = z.object({
  receivableAccountId: z.string().uuid(),
  salesAccountId: z.string().uuid(),
  outputCgstAccountId: z.string().uuid(),
  outputSgstAccountId: z.string().uuid(),
  outputIgstAccountId: z.string().uuid(),
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId/sales')
export class SalesInvoicePostingController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('posting-accounts')
  async getPostingAccounts(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT receivable_account_id AS "receivableAccountId", sales_account_id AS "salesAccountId",
               output_cgst_account_id AS "outputCgstAccountId", output_sgst_account_id AS "outputSgstAccountId",
               output_igst_account_id AS "outputIgstAccountId"
          FROM sales_posting_accounts WHERE company_id = $1`, [companyId]);
      return { postingAccounts: result.rows[0] ?? null };
    });
  }

  @Put('posting-accounts')
  @CompanyRoles('owner', 'admin')
  async configurePostingAccounts(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Sales posting account configuration is invalid.');
    const data = parsed.data;
    const accountIds = Object.values(data);
    if (new Set(accountIds).size !== accountIds.length) throw new BadRequestException('Sales posting accounts must be distinct.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<{ id: string; account_type: string; is_active: boolean }>(
        'SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])',
        [companyId, accountIds],
      );
      if (result.rows.length !== accountIds.length || result.rows.some((row) => !row.is_active)) {
        throw new BadRequestException('Every posting account must be an active account in this company.');
      }
      const byId = new Map(result.rows.map((row) => [row.id, row]));
      const expected: Array<[keyof typeof data, string]> = [
        ['receivableAccountId', 'asset'],
        ['salesAccountId', 'income'],
        ['outputCgstAccountId', 'liability'],
        ['outputSgstAccountId', 'liability'],
        ['outputIgstAccountId', 'liability'],
      ];
      for (const [key, type] of expected) {
        if (byId.get(data[key])?.account_type !== type) throw new BadRequestException(`${key} must reference an active ${type} account.`);
      }

      await client.query(`
        INSERT INTO sales_posting_accounts (company_id, receivable_account_id, sales_account_id, output_cgst_account_id,
          output_sgst_account_id, output_igst_account_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (company_id) DO UPDATE SET receivable_account_id = EXCLUDED.receivable_account_id,
          sales_account_id = EXCLUDED.sales_account_id, output_cgst_account_id = EXCLUDED.output_cgst_account_id,
          output_sgst_account_id = EXCLUDED.output_sgst_account_id, output_igst_account_id = EXCLUDED.output_igst_account_id,
          updated_at = now()`,
        [companyId, data.receivableAccountId, data.salesAccountId, data.outputCgstAccountId, data.outputSgstAccountId, data.outputIgstAccountId, userId],
      );
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'SALES_POSTING_ACCOUNTS_CONFIGURED',
        entityType: 'sales_posting_accounts',
        entityId: companyId,
        metadata: { companyId },
      });
      return { postingAccounts: data };
    });
  }

  @Post('invoices/:invoiceId/issue')
  @CompanyRoles('owner', 'admin', 'accountant')
  async issueInvoice(@Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const invoiceResult = await client.query<{
          id: string; invoice_number: string; invoice_date: string; status: string;
          subtotal_paise: string; discount_paise: string; taxable_paise: string;
          cgst_paise: string; sgst_paise: string; igst_paise: string; total_paise: string;
        }>(
          `SELECT id, invoice_number, invoice_date, status, subtotal_paise::text, discount_paise::text,
                  taxable_paise::text, cgst_paise::text, sgst_paise::text, igst_paise::text, total_paise::text
             FROM sales_invoices WHERE company_id = $1 AND id = $2 FOR UPDATE`,
          [companyId, invoiceId],
        );
        const invoice = invoiceResult.rows[0];
        if (!invoice) throw new BadRequestException('Sales invoice was not found in this company.');
        if (invoice.status !== 'draft') throw new ConflictException('Only draft sales invoices can be issued.');
        if (BigInt(invoice.total_paise) <= 0n) throw new BadRequestException('A sales invoice total must be greater than zero.');

        const configResult = await client.query(`SELECT receivable_account_id, sales_account_id, output_cgst_account_id, output_sgst_account_id, output_igst_account_id FROM sales_posting_accounts WHERE company_id = $1`, [companyId]);
        const config = configResult.rows[0];
        if (!config) throw new BadRequestException('Configure sales posting accounts before issuing an invoice.');

        const accounts = await client.query<{ id: string; account_type: string; is_active: boolean }>(
          'SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])',
          [companyId, [config.receivable_account_id, config.sales_account_id, config.output_cgst_account_id, config.output_sgst_account_id, config.output_igst_account_id]],
        );
        if (accounts.rows.length !== 5 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Configured sales posting accounts must all remain active.');

        const taxable = BigInt(invoice.taxable_paise);
        const cgst = BigInt(invoice.cgst_paise);
        const sgst = BigInt(invoice.sgst_paise);
        const igst = BigInt(invoice.igst_paise);
        const total = BigInt(invoice.total_paise);
        if (taxable + cgst + sgst + igst !== total) throw new BadRequestException('Invoice tax totals are inconsistent and cannot be posted.');

        const lines: Array<{ accountId: string; description: string; debitPaise: string; creditPaise: string }> = [
          { accountId: config.receivable_account_id, description: `Accounts receivable - ${invoice.invoice_number}`, debitPaise: total.toString(), creditPaise: '0' },
          { accountId: config.sales_account_id, description: `Sales revenue - ${invoice.invoice_number}`, debitPaise: '0', creditPaise: taxable.toString() },
        ];
        if (cgst > 0n) lines.push({ accountId: config.output_cgst_account_id, description: `Output CGST - ${invoice.invoice_number}`, debitPaise: '0', creditPaise: cgst.toString() });
        if (sgst > 0n) lines.push({ accountId: config.output_sgst_account_id, description: `Output SGST - ${invoice.invoice_number}`, debitPaise: '0', creditPaise: sgst.toString() });
        if (igst > 0n) lines.push({ accountId: config.output_igst_account_id, description: `Output IGST - ${invoice.invoice_number}`, debitPaise: '0', creditPaise: igst.toString() });

        const entryId = randomUUID();
        await client.query(
          `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
           VALUES ($1,$2,$3,$4::date,$5,'draft','invoice',$6)`,
          [entryId, companyId, `SI-${invoice.invoice_number}`, invoice.invoice_date, `Sales invoice ${invoice.invoice_number}`, userId],
        );
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];
          await client.query(
            `INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise)
             VALUES ($1,$2,$3,$4,$5,$6::bigint,$7::bigint)`,
            [companyId, entryId, index + 1, line.accountId, line.description, line.debitPaise, line.creditPaise],
          );
        }
        await client.query(
          `UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now()
            WHERE company_id = $1 AND id = $2`,
          [companyId, entryId, userId],
        );

        await client.query(
          `UPDATE sales_invoices SET status = 'issued', updated_at = now() WHERE company_id = $1 AND id = $2`,
          [companyId, invoiceId],
        );
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'SALES_INVOICE_ISSUED',
          entityType: 'sales_invoice',
          entityId: invoiceId,
          metadata: { companyId, invoiceNumber: invoice.invoice_number, journalEntryId: entryId, totalPaise: total.toString() },
        });
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'JOURNAL_ENTRY_POSTED',
          entityType: 'journal_entry',
          entityId: entryId,
          metadata: { companyId, sourceType: 'invoice', invoiceId, invoiceNumber: invoice.invoice_number },
        });

        return { invoiceId, invoiceNumber: invoice.invoice_number, status: 'issued', journalEntryId: entryId, totals: { taxablePaise: taxable.toString(), cgstPaise: cgst.toString(), sgstPaise: sgst.toString(), igstPaise: igst.toString(), totalPaise: total.toString() } };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An accounting journal already exists for this invoice.');
      throw error;
    }
  }
}
