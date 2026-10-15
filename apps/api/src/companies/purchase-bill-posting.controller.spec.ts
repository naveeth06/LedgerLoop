import { describe, expect, it, vi } from 'vitest';
import { PurchaseBillPostingController } from './purchase-bill-posting.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const billId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM purchase_bills')) {
      return { rows: [{ id: billId, bill_number: 'BILL-2026-000001', bill_date: '2026-10-15', status: 'draft', party_id: 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', taxable_paise: '10000', cgst_paise: '900', sgst_paise: '900', igst_paise: '0', total_paise: '11800' }] };
    }
    if (sql.includes('FROM purchase_posting_accounts')) {
      return { rows: [{ payable_account_id: '11111111-1111-4111-8111-111111111111', purchase_account_id: '22222222-2222-4222-8222-222222222222', input_cgst_account_id: '33333333-3333-4333-8333-333333333333', input_sgst_account_id: '44444444-4444-4444-8444-444444444444', input_igst_account_id: '55555555-5555-4555-8555-555555555555' }] };
    }
    if (sql.includes('FROM ledger_accounts')) {
      return { rows: [
        { id: '11111111-1111-4111-8111-111111111111', account_type: 'liability', is_active: true },
        { id: '22222222-2222-4222-8222-222222222222', account_type: 'expense', is_active: true },
        { id: '33333333-3333-4333-8333-333333333333', account_type: 'asset', is_active: true },
        { id: '44444444-4444-4444-8444-444444444444', account_type: 'asset', is_active: true },
        { id: '55555555-5555-4555-8555-555555555555', account_type: 'asset', is_active: true },
      ] };
    }
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new PurchaseBillPostingController(tenantAccess as never, audit as never), query, audit };
}

describe('PurchaseBillPostingController', () => {
  it('posts a same-state purchase bill to purchases, input GST and payables', async () => {
    const { controller, audit } = setup();
    const result = await controller.postBill(companyId, billId, request);
    expect(result.status).toBe('received');
    expect(result.journalEntryId).toBeTypeOf('string');
    expect(result.totals.totalPaise).toBe('11800');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PURCHASE_BILL_POSTED' }));
  });

  it('rejects a non-draft bill', async () => {
    const { controller, query } = setup();
    query.mockImplementationOnce(async () => ({ rows: [{ id: billId, bill_number: 'BILL-2026-000001', bill_date: '2026-10-15', status: 'received', party_id: 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', taxable_paise: '10000', cgst_paise: '900', sgst_paise: '900', igst_paise: '0', total_paise: '11800' }] }));
    await expect(controller.postBill(companyId, billId, request)).rejects.toThrow('Only draft purchase bills can be posted.');
  });
});
