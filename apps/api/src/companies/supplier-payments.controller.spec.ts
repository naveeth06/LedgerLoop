import { describe, expect, it, vi } from 'vitest';
import { SupplierPaymentsController } from './supplier-payments.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const paymentId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const billId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM supplier_payments') && sql.includes('FOR UPDATE')) {
      return { rows: [{ id: paymentId, payment_number: 'SP-000001', payment_date: '2026-10-15', party_id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', account_id: '11111111-1111-4111-8111-111111111111', amount_paise: '11800', status: 'draft' }] };
    }
    if (sql.includes('FROM ledger_accounts') && sql.includes('account_id')) {
      return { rows: [{ account_type: 'asset', is_active: true }] };
    }
    if (sql.includes('FROM purchase_posting_accounts')) {
      return { rows: [{ payable_account_id: '22222222-2222-4222-8222-222222222222' }] };
    }
    if (sql.includes('FROM ledger_accounts')) {
      return { rows: [{ account_type: 'liability', is_active: true }] };
    }
    if (sql.includes('FROM supplier_payment_allocations')) {
      return { rows: [{ bill_id: billId, allocated_paise: '11800', party_id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', status: 'received', total_paise: '11800', posted_allocated_paise: '0' }] };
    }
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new SupplierPaymentsController(tenantAccess as never, audit as never), query, audit };
}

describe('SupplierPaymentsController', () => {
  it('posts a supplier payment against a received purchase bill', async () => {
    const { controller, audit } = setup();
    const result = await controller.postPayment(companyId, paymentId, request);
    expect(result.status).toBe('posted');
    expect(result.journalEntryId).toBeTypeOf('string');
    expect(result.amountPaise).toBe('11800');
    expect(result.allocatedPaise).toBe('11800');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SUPPLIER_PAYMENT_POSTED' }));
  });

  it('rejects a non-draft supplier payment', async () => {
    const { controller, query } = setup();
    query.mockImplementationOnce(async () => ({ rows: [{ id: paymentId, payment_number: 'SP-000001', payment_date: '2026-10-15', party_id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', account_id: '11111111-1111-4111-8111-111111111111', amount_paise: '11800', status: 'posted' }] }));
    await expect(controller.postPayment(companyId, paymentId, request)).rejects.toThrow('Only draft supplier payments can be posted.');
  });
});
