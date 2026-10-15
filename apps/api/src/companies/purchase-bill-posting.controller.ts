import { BadRequestException, ConflictException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const accountSchema = z.object({
  payableAccountId: z.string().uuid(),
  purchaseAccountId: z.string().uuid(),
  inputCgstAccountId: z.string().uuid(),
  inputSgstAccountId: z.string().uuid(),
  inputIgstAccountId: z.string().uuid(),
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId/purchases')
export class PurchaseBillPostingController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('posting-accounts')
  async getPostingAccounts(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT payable_account_id AS "payableAccountId", purchase_account_id AS "purchaseAccountId",
               input_cgst_account_id AS "inputCgstAccountId", input_sgst_account_id AS "inputSgstAccountId",
               input_igst_account_id AS "inputIgstAccountId"
          FROM purchase_posting_accounts WHERE company_id = $1`, [companyId]);
      return { postingAccounts: result.rows[0] ?? null };
    });
  }

  @Put('posting-accounts')
  @CompanyRoles('owner', 'admin')
  async configurePostingAccounts(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Purchase posting account configuration is invalid.');
    const data = parsed.data;
    const ids = Object.values(data);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Purchase posting accounts must be distinct.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<{ id: string; account_type: string; is_active: boolean }>(
        'SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids]);
      if (result.rows.length !== ids.length || result.rows.some((row) => !row.is_active)) {
        throw new BadRequestException('Every posting account must be an active account in this company.');
      }
      const byId = new Map(result.rows.map((row) => [row.id, row.account_type]));
      const expected: Array<[keyof typeof data, string]> = [
        ['payableAccountId', 'liability'],
        ['purchaseAccountId', 'expense'],
        ['inputCgstAccountId', 'asset'],
        ['inputSgstAccountId', 'asset'],
        ['inputIgstAccountId', 'asset'],
      ];
      for (const [key, type] of expected) {
        if (byId.get(data[key]) !== type) throw new BadRequestException(`${key} must reference an active ${type} account.`);
      }

      await client.query(`
        INSERT INTO purchase_posting_accounts (company_id, payable_account_id, purchase_account_id, input_cgst_account_id, input_sgst_account_id, input_igst_account_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (company_id) DO UPDATE SET payable_account_id = EXCLUDED.payable_account_id,
          purchase_account_id = EXCLUDED.purchase_account_id, input_cgst_account_id = EXCLUDED.input_cgst_account_id,
          input_sgst_account_id = EXCLUDED.input_sgst_account_id, input_igst_account_id = EXCLUDED.input_igst_account_id, updated_at = now()`,
        [companyId, data.payableAccountId, data.purchaseAccountId, data.inputCgstAccountId, data.inputSgstAccountId, data.inputIgstAccountId, userId]);
      await this.audit.record(client, { actorUserId: userId, action: 'PURCHASE_POSTING_ACCOUNTS_CONFIGURED', entityType: 'purchase_posting_accounts', entityId: companyId, metadata: { companyId } });
      return { postingAccounts: data };
    });
  }

  @Post('bills/:billId/post')
  @CompanyRoles('owner', 'admin', 'accountant')
  async postBill(@Param('companyId') companyId: string, @Param('billId') billId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const billResult = await client.query<{
          id: string; bill_number: string; bill_date: string; status: string; party_id: string;
          taxable_paise: string; cgst_paise: string; sgst_paise: string; igst_paise: string; total_paise: string;
        }>(`SELECT id, bill_number, bill_date, status, party_id, taxable_paise::text, cgst_paise::text, sgst_paise::text, igst_paise::text, total_paise::text
             FROM purchase_bills WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, billId]);
        const bill = billResult.rows[0];
        if (!bill) throw new BadRequestException('Purchase bill was not found in this company.');
        if (bill.status !== 'draft') throw new ConflictException('Only draft purchase bills can be posted.');
        const taxable = BigInt(bill.taxable_paise);
        const cgst = BigInt(bill.cgst_paise);
        const sgst = BigInt(bill.sgst_paise);
        const igst = BigInt(bill.igst_paise);
        const total = BigInt(bill.total_paise);
        if (total <= 0n || taxable + cgst + sgst + igst !== total) throw new BadRequestException('Purchase bill totals are invalid and cannot be posted.');

        const configResult = await client.query(`SELECT payable_account_id, purchase_account_id, input_cgst_account_id, input_sgst_account_id, input_igst_account_id FROM purchase_posting_accounts WHERE company_id = $1`, [companyId]);
        const config = configResult.rows[0];
        if (!config) throw new BadRequestException('Configure purchase posting accounts before posting a bill.');
        const ids = [config.payable_account_id, config.purchase_account_id, config.input_cgst_account_id, config.input_sgst_account_id, config.input_igst_account_id];
        const accounts = await client.query<{ id: string; account_type: string; is_active: boolean }>('SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids]);
        if (accounts.rows.length !== 5 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Configured purchase posting accounts must all remain active.');

        const entryId = randomUUID();
        const lines: Array<{ accountId: string; description: string; debit: string; credit: string }> = [
          { accountId: config.purchase_account_id, description: `Purchases - ${bill.bill_number}`, debit: taxable.toString(), credit: '0' },
          { accountId: config.payable_account_id, description: `Accounts payable - ${bill.bill_number}`, debit: '0', credit: total.toString() },
        ];
        if (cgst > 0n) lines.push({ accountId: config.input_cgst_account_id, description: `Input CGST - ${bill.bill_number}`, debit: cgst.toString(), credit: '0' });
        if (sgst > 0n) lines.push({ accountId: config.input_sgst_account_id, description: `Input SGST - ${bill.bill_number}`, debit: sgst.toString(), credit: '0' });
        if (igst > 0n) lines.push({ accountId: config.input_igst_account_id, description: `Input IGST - ${bill.bill_number}`, debit: igst.toString(), credit: '0' });

        await client.query(`INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
          VALUES ($1,$2,$3,$4::date,$5,'draft','purchase_bill',$6)`, [entryId, companyId, `PB-${bill.bill_number}`, bill.bill_date, `Purchase bill ${bill.bill_number}`, userId]);
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];
          await client.query(`INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise)
            VALUES ($1,$2,$3,$4,$5,$6::bigint,$7::bigint)`, [companyId, entryId, index + 1, line.accountId, line.description, line.debit, line.credit]);
        }
        await client.query(`UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2`, [companyId, entryId, userId]);
        await client.query(`UPDATE purchase_bills SET status = 'received', updated_at = now() WHERE company_id = $1 AND id = $2`, [companyId, billId]);
        await this.audit.record(client, { actorUserId: userId, action: 'PURCHASE_BILL_POSTED', entityType: 'purchase_bill', entityId: billId, metadata: { companyId, billNumber: bill.bill_number, journalEntryId: entryId, totalPaise: total.toString(), supplierPartyId: bill.party_id } });
        await this.audit.record(client, { actorUserId: userId, action: 'JOURNAL_ENTRY_POSTED', entityType: 'journal_entry', entityId: entryId, metadata: { companyId, sourceType: 'purchase_bill', billId, billNumber: bill.bill_number } });
        return { billId, billNumber: bill.bill_number, status: 'received', journalEntryId: entryId, totals: { taxablePaise: taxable.toString(), cgstPaise: cgst.toString(), sgstPaise: sgst.toString(), igstPaise: igst.toString(), totalPaise: total.toString() } };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An accounting journal already exists for this purchase bill.');
      throw error;
    }
  }
}
