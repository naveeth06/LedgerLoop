import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const paiseSchema = z.string().regex(/^[1-9][0-9]*$/, 'Must be a positive integer amount in paise.');
const paymentSchema = z.object({
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partyId: z.string().uuid(),
  accountId: z.string().uuid(),
  amountPaise: paiseSchema,
  reference: z.string().max(160).optional(),
  notes: z.string().max(5000).optional(),
  allocations: z.array(z.object({ billId: z.string().uuid(), allocatedPaise: paiseSchema }).strict()).default([]),
}).strict();

@Controller('companies/:companyId/purchases/supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('outstanding-bills')
  async outstandingBills(
    @Param('companyId') companyId: string,
    @Query('partyId') partyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsedPartyId = z.string().uuid().safeParse(partyId);
    if (!parsedPartyId.success) throw new BadRequestException('A valid supplier partyId is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT b.id AS "billId", b.bill_number AS "billNumber", b.bill_date AS "billDate",
               b.due_date AS "dueDate", b.total_paise::text AS "totalPaise",
               COALESCE(SUM(CASE WHEN p.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)::text AS "allocatedPaise",
               (b.total_paise - COALESCE(SUM(CASE WHEN p.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0))::text AS "outstandingPaise"
          FROM purchase_bills b
          LEFT JOIN supplier_payment_allocations a ON a.company_id = b.company_id AND a.bill_id = b.id
          LEFT JOIN supplier_payments p ON p.company_id = a.company_id AND p.id = a.payment_id
         WHERE b.company_id = $1 AND b.party_id = $2 AND b.status = 'received'
         GROUP BY b.id
        HAVING b.total_paise > COALESCE(SUM(CASE WHEN p.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)
         ORDER BY b.bill_date, b.bill_number`,
        [companyId, parsedPartyId.data],
      );
      return { bills: result.rows };
    });
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createPayment(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Supplier payment payload is invalid.');
    const data = parsed.data;
    const amount = BigInt(data.amountPaise);
    const uniqueBillIds = [...new Set(data.allocations.map((allocation) => allocation.billId))];
    if (uniqueBillIds.length !== data.allocations.length) {
      throw new BadRequestException('Each purchase bill may appear only once in a supplier payment allocation.');
    }

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const partyResult = await client.query<{ party_type: string; is_active: boolean }>(
        'SELECT party_type, is_active FROM company_parties WHERE company_id = $1 AND id = $2',
        [companyId, data.partyId],
      );
      const party = partyResult.rows[0];
      if (!party || !party.is_active || !['supplier', 'both'].includes(party.party_type)) {
        throw new BadRequestException('Payment party must be an active supplier in this company.');
      }

      const accountResult = await client.query<{ account_type: string; is_active: boolean }>(
        'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
        [companyId, data.accountId],
      );
      const account = accountResult.rows[0];
      if (!account || !account.is_active || account.account_type !== 'asset') {
        throw new BadRequestException('Payment account must be an active asset bank or cash account in this company.');
      }

      let allocationTotal = 0n;
      if (uniqueBillIds.length > 0) {
        const billResult = await client.query<{
          id: string;
          party_id: string;
          status: string;
          total_paise: string;
          allocated_paise: string;
        }>(
          `SELECT b.id, b.party_id, b.status, b.total_paise::text,
                  COALESCE(SUM(CASE WHEN p.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0)::text AS allocated_paise
             FROM purchase_bills b
             LEFT JOIN supplier_payment_allocations a ON a.company_id = b.company_id AND a.bill_id = b.id
             LEFT JOIN supplier_payments p ON p.company_id = a.company_id AND p.id = a.payment_id
            WHERE b.company_id = $1 AND b.id = ANY($2::uuid[])
            GROUP BY b.id`,
          [companyId, uniqueBillIds],
        );
        const bills = new Map(billResult.rows.map((bill) => [bill.id, bill]));
        if (bills.size !== uniqueBillIds.length) throw new BadRequestException('Every allocated purchase bill must belong to this company.');
        for (const allocation of data.allocations) {
          const bill = bills.get(allocation.billId);
          if (!bill || bill.status !== 'received') throw new BadRequestException('Only received purchase bills can receive payment allocations.');
          if (bill.party_id !== data.partyId) throw new BadRequestException('Payment allocations must belong to the same supplier as the payment.');
          const allocated = BigInt(allocation.allocatedPaise);
          const outstanding = BigInt(bill.total_paise) - BigInt(bill.allocated_paise);
          if (allocated > outstanding) throw new BadRequestException(`Allocation for bill ${allocation.billId} exceeds its outstanding balance.`);
          allocationTotal += allocated;
        }
      }
      if (allocationTotal > amount) throw new BadRequestException('Payment allocations cannot exceed the payment amount.');

      const sequence = await client.query<{ payment_number: string }>(
        `INSERT INTO company_document_sequences (company_id, supplier_payment_next)
         VALUES ($1, 2)
         ON CONFLICT (company_id) DO UPDATE SET supplier_payment_next = company_document_sequences.supplier_payment_next + 1, updated_at = now()
         RETURNING (supplier_payment_next - 1)::text AS payment_number`,
        [companyId],
      );
      const paymentNumber = `SP-${sequence.rows[0].payment_number.padStart(6, '0')}`;
      const paymentId = randomUUID();

      await client.query(
        `INSERT INTO supplier_payments (id, company_id, payment_number, payment_date, party_id, account_id, amount_paise, reference, notes, status, created_by)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7::bigint,$8,$9,'draft',$10)`,
        [paymentId, companyId, paymentNumber, data.paymentDate, data.partyId, data.accountId, data.amountPaise, data.reference ?? null, data.notes ?? null, userId],
      );

      for (const allocation of data.allocations) {
        await client.query(
          `INSERT INTO supplier_payment_allocations (company_id, payment_id, bill_id, allocated_paise)
           VALUES ($1,$2,$3,$4::bigint)`,
          [companyId, paymentId, allocation.billId, allocation.allocatedPaise],
        );
      }

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'SUPPLIER_PAYMENT_CREATED',
        entityType: 'supplier_payment',
        entityId: paymentId,
        metadata: { companyId, paymentNumber, partyId: data.partyId, amountPaise: amount.toString(), allocatedPaise: allocationTotal.toString() },
      });

      return {
        paymentId,
        paymentNumber,
        status: 'draft',
        amountPaise: amount.toString(),
        allocatedPaise: allocationTotal.toString(),
        unallocatedPaise: (amount - allocationTotal).toString(),
      };
    });
  }

  @Post(':paymentId/post')
  @CompanyRoles('owner', 'admin', 'accountant')
  async postPayment(
    @Param('companyId') companyId: string,
    @Param('paymentId') paymentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const paymentResult = await client.query<{
        id: string;
        payment_number: string;
        payment_date: string;
        party_id: string;
        account_id: string;
        amount_paise: string;
        status: string;
      }>(
        `SELECT id, payment_number, payment_date, party_id, account_id, amount_paise::text, status
           FROM supplier_payments WHERE company_id = $1 AND id = $2 FOR UPDATE`,
        [companyId, paymentId],
      );
      const payment = paymentResult.rows[0];
      if (!payment) throw new BadRequestException('Supplier payment was not found in this company.');
      if (payment.status !== 'draft') throw new ConflictException('Only draft supplier payments can be posted.');

      const accountResult = await client.query<{ account_type: string; is_active: boolean }>(
        'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
        [companyId, payment.account_id],
      );
      const account = accountResult.rows[0];
      if (!account || !account.is_active || account.account_type !== 'asset') {
        throw new BadRequestException('Payment account must remain an active asset account.');
      }

      const postingResult = await client.query<{ payable_account_id: string }>(
        'SELECT payable_account_id FROM purchase_posting_accounts WHERE company_id = $1',
        [companyId],
      );
      const posting = postingResult.rows[0];
      if (!posting) throw new BadRequestException('Configure purchase posting accounts before posting a supplier payment.');

      const payableResult = await client.query<{ account_type: string; is_active: boolean }>(
        'SELECT account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = $2',
        [companyId, posting.payable_account_id],
      );
      const payable = payableResult.rows[0];
      if (!payable || !payable.is_active || payable.account_type !== 'liability') {
        throw new BadRequestException('Configured supplier payable account must remain an active liability account.');
      }
      if (posting.payable_account_id === payment.account_id) {
        throw new BadRequestException('Payment bank/cash account cannot be the configured supplier payable account.');
      }

      const allocationResult = await client.query<{
        bill_id: string;
        allocated_paise: string;
        party_id: string;
        status: string;
        total_paise: string;
        posted_allocated_paise: string;
      }>(
        `SELECT a.bill_id, a.allocated_paise::text, b.party_id, b.status, b.total_paise::text,
                COALESCE((SELECT SUM(a2.allocated_paise) FROM supplier_payment_allocations a2
                  JOIN supplier_payments p2 ON p2.company_id = a2.company_id AND p2.id = a2.payment_id
                 WHERE a2.company_id = b.company_id AND a2.bill_id = b.id AND p2.status = 'posted'), 0)::text AS posted_allocated_paise
           FROM supplier_payment_allocations a
           JOIN purchase_bills b ON b.company_id = a.company_id AND b.id = a.bill_id
          WHERE a.company_id = $1 AND a.payment_id = $2
          ORDER BY b.id
          FOR UPDATE OF b`,
        [companyId, paymentId],
      );

      let allocationTotal = 0n;
      for (const allocation of allocationResult.rows) {
        if (allocation.status !== 'received') throw new BadRequestException('Only received purchase bills can receive payment allocations.');
        if (allocation.party_id !== payment.party_id) throw new BadRequestException('Payment allocations must belong to the payment supplier.');
        const allocated = BigInt(allocation.allocated_paise);
        const outstanding = BigInt(allocation.total_paise) - BigInt(allocation.posted_allocated_paise);
        if (allocated > outstanding) throw new ConflictException(`Bill ${allocation.bill_id} no longer has enough outstanding balance for this allocation.`);
        allocationTotal += allocated;
      }

      const amount = BigInt(payment.amount_paise);
      if (allocationTotal > amount) throw new BadRequestException('Payment allocations cannot exceed the payment amount.');

      const entryId = randomUUID();
      await client.query(
        `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
         VALUES ($1,$2,$3,$4::date,$5,'draft','supplier_payment',$6)`,
        [entryId, companyId, `SP-${payment.payment_number}`, payment.payment_date, `Supplier payment ${payment.payment_number}`, userId],
      );
      await client.query(
        `INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise)
         VALUES ($1,$2,1,$3,$4,$5::bigint,0),($1,$2,2,$6,$7,0,$5::bigint)`,
        [companyId, entryId, posting.payable_account_id, `Supplier payable - ${payment.payment_number}`, amount.toString(), payment.account_id, `Payment ${payment.payment_number} - bank/cash`],
      );
      await client.query(
        `UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now()
          WHERE company_id = $1 AND id = $2`,
        [companyId, entryId, userId],
      );
      await client.query(
        `UPDATE supplier_payments SET status = 'posted', journal_entry_id = $3, updated_at = now()
          WHERE company_id = $1 AND id = $2`,
        [companyId, paymentId, entryId],
      );

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'SUPPLIER_PAYMENT_POSTED',
        entityType: 'supplier_payment',
        entityId: paymentId,
        metadata: { companyId, paymentNumber: payment.payment_number, journalEntryId: entryId, amountPaise: amount.toString(), allocatedPaise: allocationTotal.toString() },
      });
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'JOURNAL_ENTRY_POSTED',
        entityType: 'journal_entry',
        entityId: entryId,
        metadata: { companyId, sourceType: 'supplier_payment', supplierPaymentId: paymentId, paymentNumber: payment.payment_number },
      });

      return {
        paymentId,
        paymentNumber: payment.payment_number,
        status: 'posted',
        journalEntryId: entryId,
        amountPaise: amount.toString(),
        allocatedPaise: allocationTotal.toString(),
        unallocatedPaise: (amount - allocationTotal).toString(),
      };
    });
  }
}
