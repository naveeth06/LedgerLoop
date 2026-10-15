import { describe, expect, it, vi } from 'vitest';
import { ExpensesDebitNotesController } from './expenses-debit-notes.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const expenseId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const debitNoteId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const billId = 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const expenseAccountId = '11111111-1111-4111-8111-111111111111';
const paymentAccountId = '22222222-2222-4222-8222-222222222222';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM ledger_accounts')) {
      return { rows: [
        { id: expenseAccountId, account_type: 'expense', is_active: true },
        { id: paymentAccountId, account_type: 'asset', is_active: true },
      ] };
    }
    if (sql.includes('FROM expense_documents') && sql.includes('FOR UPDATE')) {
      return { rows: [{ id: expenseId, expense_number: 'EXP-2026-000001', expense_date: '2026-10-16', expense_account_id: expenseAccountId, payment_account_id: paymentAccountId, taxable_paise: '10000', cgst_paise: '900', sgst_paise: '900', igst_paise: '0', total_paise: '11800', status: 'draft' }] };
    }
    if (sql.includes('FROM purchase_posting_accounts')) {
      return { rows: [{ input_cgst_account_id: '33333333-3333-4333-8333-333333333333', input_sgst_account_id: '44444444-4444-4444-8444-444444444444', input_igst_account_id: '55555555-5555-4555-8555-555555555555' }] };
    }
    if (sql.includes('FROM supplier_debit_notes') && sql.includes('FOR UPDATE')) {
      return { rows: [{ id: debitNoteId, debit_note_number: 'DN-2026-000001', note_date: '2026-10-16', purchase_bill_id: billId, party_id: '66666666-6666-4666-8666-666666666666', taxable_paise: '9000', cgst_paise: '810', sgst_paise: '810', igst_paise: '0', total_paise: '10620', status: 'draft' }] };
    }
    if (sql.includes('FROM purchase_bills') && sql.includes('FOR UPDATE')) {
      return { rows: [{ party_id: '66666666-6666-4666-8666-666666666666', status: 'received', total_paise: '10000' }] };
    }
    if (sql.includes('supplier_payment_allocations')) {
      return { rows: [{ paid: '0', debited: '0' }] };
    }
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new ExpensesDebitNotesController(tenantAccess as never, audit as never), query, audit };
}

describe('ExpensesDebitNotesController', () => {
  it('rejects an expense when the payment account is the same as the expense account', async () => {
    const { controller } = setup();
    await expect(controller.createExpense(companyId, {
      expenseDate: '2026-10-16', expenseAccountId, paymentAccountId: expenseAccountId,
      description: 'Office expense', taxablePaise: '10000',
    }, request)).rejects.toThrow('Expense and payment accounts must be different.');
  });

  it('posts a draft expense atomically and records the audit event', async () => {
    const { controller, audit } = setup();
    const result = await controller.postExpense(companyId, expenseId, request);
    expect(result.status).toBe('posted');
    expect(result.totalPaise).toBe('11800');
    expect(result.journalEntryId).toBeTypeOf('string');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'EXPENSE_POSTED' }));
  });

  it('rejects a supplier debit note that exceeds the remaining bill amount', async () => {
    const { controller } = setup();
    await expect(controller.postDebitNote(companyId, debitNoteId, request)).rejects.toThrow('cannot exceed the bill amount remaining');
  });
});
