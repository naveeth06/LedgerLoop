import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const paiseSchema = z.string().regex(/^[1-9][0-9]*$/, 'Must be a positive integer amount in paise.');
const receiptSchema = z.object({
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partyId: z.string().uuid(),
  accountId: z.string().uuid(),
  amountPaise: paiseSchema,
  reference: z.string().max(160).optional(),
  notes: z.string().max(5000).optional(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), allocatedPaise: paiseSchema }).strict()).default([]),
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId/sales/receipts')
export class SalesReceiptsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('outstanding-invoices')
  async outstandingInvoices(
    @Param('companyId') companyId: string,
    @Query('partyId') partyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsedPartyId = z.string().uuid().safeParse(partyId);
    if (!parsedPartyId.success) throw new BadRequestException('A valid customer partyId is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT i.id AS "invoiceId", i.invoice_number AS "invoiceNumber", i.invoice_date AS "invoiceDate",
               i.due_date AS "dueDate", i.total_paise::text AS "totalPaise",
               COALESCE(SUM(CASE WHEN r.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)::text AS "allocatedPaise",
               (i.total_paise - COALESCE(SUM(CASE WHEN r.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0))::text AS "outstandingPaise"
          FROM sales_invoices i
          LEFT JOIN sales_receipt_allocations a ON a.company_id = i.company_id AND a.invoice_id = i.id
          LEFT JOIN sales_receipts r ON r.company_id = a.company_id AND r.id = a.receipt_id
         WHERE i.company_id = $1 AND i.party_id = $2 AND i.status = 'issued'
         GROUP BY i.id
        HAVING i.total_paise > COALESCE(SUM(CASE WHEN r.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)
         ORDER BY i.invoice_date, i.invoice_number`,
        [companyId, parsedPartyId.data],
      );
      return { invoices: result.rows };
    });
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createReceipt(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = receiptSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Receipt payload is invalid.');
    const data = parsed.data;
    const amount = BigInt(data.amountPaise);
    const uniqueInvoiceIds = [...new Set(data.allocations.map((allocation) => allocation.invoiceId))];
    if (uniqueInvoiceIds.length !== data.allocations.length) {
      throw new BadRequestException('Each invoice may appear only once in a receipt allocation.');
    }

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const partyResult = await client.query<{ party_type: string; is_active: boolean }>(
          'SELECT party_type, is_active FROM company_parties WHERE company_id = $1 AND id = $2',
          [companyId, data.partyId],
        );
        const party = partyResult.rows[0];
        if (!party || !party.is_active || !['customer', 'both'].includes(party.party_type)) {
          throw new BadRequestException('Receipt party must be an active customer in this company.');
        }

        const accountResult = await client.query<{ account_type: string; is_active: boolean }>(
          'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
          [companyId, data.accountId],
        );
        const account = accountResult.rows[0];
        if (!account || !account.is_active || account.account_type !== 'asset') {
          throw new BadRequestException('Receipt account must be an active asset account in this company.');
        }

        let allocationTotal = 0n;
        const invoices = new Map<string, {
          id: string;
          party_id: string;
          status: string;
          total_paise: string;
          allocated_paise: string;
        }>();

        if (uniqueInvoiceIds.length > 0) {
          const invoiceResult = await client.query<{
            id: string;
            party_id: string;
            status: string;
            total_paise: string;
            allocated_paise: string;
          }>(
            `SELECT i.id, i.party_id, i.status, i.total_paise::text,
                    COALESCE(SUM(CASE WHEN r.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)::text AS allocated_paise
               FROM sales_invoices i
               LEFT JOIN sales_receipt_allocations a ON a.company_id = i.company_id AND a.invoice_id = i.id
               LEFT JOIN sales_receipts r ON r.company_id = a.company_id AND r.id = a.receipt_id
              WHERE i.company_id = $1 AND i.id = ANY($2::uuid[])
              GROUP BY i.id`,
            [companyId, uniqueInvoiceIds],
          );
          for (const invoice of invoiceResult.rows) invoices.set(invoice.id, invoice);
          if (invoices.size !== uniqueInvoiceIds.length) {
            throw new BadRequestException('Every allocated invoice must belong to this company.');
          }
        }

        for (const allocation of data.allocations) {
          const invoice = invoices.get(allocation.invoiceId);
          if (!invoice || invoice.status !== 'issued') {
            throw new BadRequestException('Only issued sales invoices can receive allocations.');
          }
          if (invoice.party_id !== data.partyId) {
            throw new BadRequestException('Receipt allocations must belong to the same customer as the receipt.');
          }
          const allocated = BigInt(allocation.allocatedPaise);
          const outstanding = BigInt(invoice.total_paise) - BigInt(invoice.allocated_paise);
          if (allocated > outstanding) {
            throw new BadRequestException(`Allocation for invoice ${allocation.invoiceId} exceeds its outstanding balance.`);
          }
          allocationTotal += allocated;
        }
        if (allocationTotal > amount) {
          throw new BadRequestException('Receipt allocations cannot exceed the receipt amount.');
        }

        const sequence = await client.query<{ receipt_number: string }>(
          `INSERT INTO company_document_sequences (company_id, receipt_next)
           VALUES ($1, 2)
           ON CONFLICT (company_id) DO UPDATE SET receipt_next = company_document_sequences.receipt_next + 1, updated_at = now()
           RETURNING (receipt_next - 1)::text AS receipt_number`,
          [companyId],
        );
        const receiptNumber = `RC-${sequence.rows[0].receipt_number.padStart(6, '0')}`;
        const receiptId = randomUUID();

        await client.query(
          `INSERT INTO sales_receipts (id, company_id, receipt_number, receipt_date, party_id, account_id, amount_paise, reference, notes, status, created_by)
           VALUES ($1,$2,$3,$4::date,$5,$6,$7::bigint,$8,$9,'draft',$10)`,
          [receiptId, companyId, receiptNumber, data.receiptDate, data.partyId, data.accountId, data.amountPaise, data.reference ?? null, data.notes ?? null, userId],
        );

        for (const allocation of data.allocations) {
          await client.query(
            `INSERT INTO sales_receipt_allocations (company_id, receipt_id, invoice_id, allocated_paise)
             VALUES ($1,$2,$3,$4::bigint)`,
            [companyId, receiptId, allocation.invoiceId, allocation.allocatedPaise],
          );
        }

        await this.audit.record(client, {
          actorUserId: userId,
          action: 'SALES_RECEIPT_CREATED',
          entityType: 'sales_receipt',
          entityId: receiptId,
          metadata: { companyId, receiptNumber, partyId: data.partyId, amountPaise: amount.toString(), allocatedPaise: allocationTotal.toString() },
        });

        return {
          receiptId,
          receiptNumber,
          status: 'draft',
          amountPaise: amount.toString(),
          allocatedPaise: allocationTotal.toString(),
          unallocatedPaise: (amount - allocationTotal).toString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A duplicate receipt allocation or receipt number was detected.');
      throw error;
    }
  }

  @Post(':receiptId/post')
  @CompanyRoles('owner', 'admin', 'accountant')
  async postReceipt(
    @Param('companyId') companyId: string,
    @Param('receiptId') receiptId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const receiptResult = await client.query<{
          id: string;
          receipt_number: string;
          receipt_date: string;
          party_id: string;
          account_id: string;
          amount_paise: string;
          status: string;
        }>(
          `SELECT id, receipt_number, receipt_date, party_id, account_id, amount_paise::text, status
             FROM sales_receipts WHERE company_id = $1 AND id = $2 FOR UPDATE`,
          [companyId, receiptId],
        );
        const receipt = receiptResult.rows[0];
        if (!receipt) throw new BadRequestException('Sales receipt was not found in this company.');
        if (receipt.status !== 'draft') throw new ConflictException('Only draft receipts can be posted.');

        const accountResult = await client.query<{ account_type: string; is_active: boolean }>(
          'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
          [companyId, receipt.account_id],
        );
        const account = accountResult.rows[0];
        if (!account || !account.is_active || account.account_type !== 'asset') {
          throw new BadRequestException('Receipt account must remain an active asset account.');
        }

        const postingResult = await client.query<{ receivable_account_id: string }>(
          'SELECT receivable_account_id FROM sales_posting_accounts WHERE company_id = $1',
          [companyId],
        );
        const posting = postingResult.rows[0];
        if (!posting) throw new BadRequestException('Configure sales posting accounts before posting a receipt.');

        const receivableResult = await client.query<{ account_type: string; is_active: boolean }>(
          'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
          [companyId, posting.receivable_account_id],
        );
        const receivable = receivableResult.rows[0];
        if (!receivable || !receivable.is_active || receivable.account_type !== 'asset') {
          throw new BadRequestException('Configured receivable account must remain an active asset account.');
        }
        if (posting.receivable_account_id === receipt.account_id) {
          throw new BadRequestException('Receipt bank/cash account cannot be the configured receivable account.');
        }

        const allocationResult = await client.query<{
          invoice_id: string;
          allocated_paise: string;
          party_id: string;
          status: string;
          total_paise: string;
          posted_allocated_paise: string;
        }>(
          `SELECT a.invoice_id, a.allocated_paise::text, i.party_id, i.status, i.total_paise::text,
                  COALESCE((SELECT SUM(a2.allocated_paise) FROM sales_receipt_allocations a2
                    JOIN sales_receipts r2 ON r2.company_id = a2.company_id AND r2.id = a2.receipt_id
                   WHERE a2.company_id = i.company_id AND a2.invoice_id = i.id AND r2.status = 'posted'), 0)::text AS posted_allocated_paise
             FROM sales_receipt_allocations a
             JOIN sales_invoices i ON i.company_id = a.company_id AND i.id = a.invoice_id
            WHERE a.company_id = $1 AND a.receipt_id = $2
            ORDER BY i.id
            FOR UPDATE OF i`,
          [companyId, receiptId],
        );

        let allocationTotal = 0n;
        for (const allocation of allocationResult.rows) {
          if (allocation.status !== 'issued') throw new BadRequestException('Only issued sales invoices can receive allocations.');
          if (allocation.party_id !== receipt.party_id) throw new BadRequestException('Receipt allocations must belong to the receipt customer.');
          const allocated = BigInt(allocation.allocated_paise);
          const outstanding = BigInt(allocation.total_paise) - BigInt(allocation.posted_allocated_paise);
          if (allocated > outstanding) {
            throw new ConflictException(`Invoice ${allocation.invoice_id} no longer has enough outstanding balance for this allocation.`);
          }
          allocationTotal += allocated;
        }

        const amount = BigInt(receipt.amount_paise);
        if (allocationTotal > amount) throw new BadRequestException('Receipt allocations cannot exceed the receipt amount.');

        const entryId = randomUUID();
        await client.query(
          `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
           VALUES ($1,$2,$3,$4::date,$5,'draft','receipt',$6)`,
          [entryId, companyId, `RC-${receipt.receipt_number}`, receipt.receipt_date, `Customer receipt ${receipt.receipt_number}`, userId],
        );
        await client.query(
          `INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise)
           VALUES ($1,$2,1,$3,$4,$5::bigint,0),($1,$2,2,$6,$7,0,$5::bigint)`,
          [companyId, entryId, receipt.account_id, `Receipt ${receipt.receipt_number} - bank/cash`, amount.toString(), posting.receivable_account_id, `Accounts receivable - ${receipt.receipt_number}`],
        );
        await client.query(
          `UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now()
            WHERE company_id = $1 AND id = $2`,
          [companyId, entryId, userId],
        );
        await client.query(
          `UPDATE sales_receipts SET status = 'posted', journal_entry_id = $3, updated_at = now()
            WHERE company_id = $1 AND id = $2`,
          [companyId, receiptId, entryId],
        );

        await this.audit.record(client, {
          actorUserId: userId,
          action: 'SALES_RECEIPT_POSTED',
          entityType: 'sales_receipt',
          entityId: receiptId,
          metadata: { companyId, receiptNumber: receipt.receipt_number, journalEntryId: entryId, amountPaise: amount.toString(), allocatedPaise: allocationTotal.toString() },
        });
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'JOURNAL_ENTRY_POSTED',
          entityType: 'journal_entry',
          entityId: entryId,
          metadata: { companyId, sourceType: 'receipt', receiptId, receiptNumber: receipt.receipt_number },
        });

        return {
          receiptId,
          receiptNumber: receipt.receipt_number,
          status: 'posted',
          journalEntryId: entryId,
          amountPaise: amount.toString(),
          allocatedPaise: allocationTotal.toString(),
          unallocatedPaise: (amount - allocationTotal).toString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An accounting journal already exists for this receipt.');
      throw error;
    }
  }
}
