import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SalesReceiptsController } from './sales-receipts.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const partyId = 'c20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const invoiceId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const accountId = '11111111-1111-4111-8111-111111111111';
const receivableAccountId = '22222222-2222-4222-8222-222222222222';
const receiptId = 'f20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup(overrides: Record<string, unknown[]> = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM company_parties')) return { rows: overrides.party ?? [{ party_type: 'customer', is_active: true }] };
    if (sql.includes('FROM sales_receipts') && sql.includes('FOR UPDATE')) return { rows: overrides.receipt ?? [{ id: receiptId, receipt_number: 'RC-000001', receipt_date: '2026-10-15', party_id: partyId, account_id: accountId, amount_paise: '15000', status: 'draft' }] };
    if (sql.includes('FROM ledger_accounts') && sql.includes('id = $2')) return { rows: overrides.account ?? [{ account_type: 'asset', is_active: true }] };
    if (sql.includes('FROM sales_posting_accounts')) return { rows: [{ receivable_account_id: receivableAccountId }] };
    if (sql.includes('FROM sales_receipt_allocations')) return { rows: overrides.allocations ?? [{ invoice_id: invoiceId, allocated_paise: '10000', party_id: partyId, status: 'issued', total_paise: '12000', posted_allocated_paise: '0' }] };
    if (sql.includes('FROM sales_invoices')) return { rows: overrides.invoices ?? [{ id: invoiceId, party_id: partyId, status: 'issued', total_paise: '12000', allocated_paise: '0' }] };
    if (sql.includes('RETURNING (receipt_next - 1)')) return { rows: [{ receipt_number: '1' }] };
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  const controller = new SalesReceiptsController(tenantAccess as never, audit as never);
  return { controller, client, audit };
}

describe('SalesReceiptsController', () => {
  it('creates a numbered draft receipt with a partial invoice allocation', async () => {
    const { controller } = setup();
    const result = await controller.createReceipt(companyId, {
      receiptDate: '2026-10-15',
      partyId,
      accountId,
      amountPaise: '15000',
      allocations: [{ invoiceId, allocatedPaise: '10000' }],
    }, request);

    expect(result).toMatchObject({ receiptNumber: 'RC-000001', status: 'draft', allocatedPaise: '10000', unallocatedPaise: '5000' });
  });

  it('rejects allocation above invoice outstanding balance', async () => {
    const { controller } = setup({ invoices: [{ id: invoiceId, party_id: partyId, status: 'issued', total_paise: '12000', allocated_paise: '11000' }] });
    await expect(controller.createReceipt(companyId, {
      receiptDate: '2026-10-15', partyId, accountId, amountPaise: '5000', allocations: [{ invoiceId, allocatedPaise: '2000' }],
    }, request)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('posts the receipt as bank/cash debit and receivable credit', async () => {
    const { controller, client, audit } = setup();
    const result = await controller.postReceipt(companyId, receiptId, request);
    expect(result.status).toBe('posted');
    expect(result.allocatedPaise).toBe('10000');
    expect(result.unallocatedPaise).toBe('5000');
    expect(client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO journal_lines'))).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SALES_RECEIPT_POSTED' }));
  });
});
