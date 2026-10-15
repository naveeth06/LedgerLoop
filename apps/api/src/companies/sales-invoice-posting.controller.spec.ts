import { describe, expect, it, vi } from 'vitest';
import { SalesInvoicePostingController } from './sales-invoice-posting.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const invoiceId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;
const accounts = {
  receivable_account_id: '11111111-1111-4111-8111-111111111111',
  sales_account_id: '22222222-2222-4222-8222-222222222222',
  output_cgst_account_id: '33333333-3333-4333-8333-333333333333',
  output_sgst_account_id: '44444444-4444-4444-8444-444444444444',
  output_igst_account_id: '55555555-5555-4555-8555-555555555555',
};

function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM sales_invoices')) return { rows: [{ id: invoiceId, invoice_number: 'INV-2026-000001', invoice_date: '2026-10-15', status: 'draft', subtotal_paise: '10000', discount_paise: '0', taxable_paise: '10000', cgst_paise: '900', sgst_paise: '900', igst_paise: '0', total_paise: '11800' }] };
    if (sql.includes('FROM sales_posting_accounts')) return { rows: [accounts] };
    if (sql.includes('FROM ledger_accounts')) return { rows: [
      { id: accounts.receivable_account_id, account_type: 'asset', is_active: true },
      { id: accounts.sales_account_id, account_type: 'income', is_active: true },
      { id: accounts.output_cgst_account_id, account_type: 'liability', is_active: true },
      { id: accounts.output_sgst_account_id, account_type: 'liability', is_active: true },
      { id: accounts.output_igst_account_id, account_type: 'liability', is_active: true },
    ] };
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  const controller = new SalesInvoicePostingController(tenantAccess as never, audit as never);
  return { controller, client, tenantAccess, audit };
}

describe('SalesInvoicePostingController', () => {
  it('posts an intra-state invoice as receivable, sales, CGST and SGST', async () => {
    const { controller, client, audit } = setup();
    const result = await controller.issueInvoice(companyId, invoiceId, request);
    expect(result.status).toBe('issued');
    expect(result.totals.totalPaise).toBe('11800');
    const journalLineInserts = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO journal_lines'));
    expect(journalLineInserts).toHaveLength(3);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SALES_INVOICE_ISSUED' }));
  });

  it('returns configured posting accounts', async () => {
    const { controller } = setup();
    const result = await controller.getPostingAccounts(companyId, request);
    expect(result.postingAccounts).toEqual(accounts);
  });
});
