import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

integrationDescribe('sales receivable settlement accounting workflow', () => {
  const companyId = 'f1111111-1111-4111-8111-111111111111';
  const userId = 'f2222222-2222-4222-8222-222222222222';
  const customerId = 'f3333333-3333-4333-8333-333333333333';
  const cashAccountId = 'f4444444-4444-4444-8444-444444444444';
  const receivableAccountId = 'f5555555-5555-4555-8555-555555555555';
  const revenueAccountId = 'f6666666-6666-4666-8666-666666666666';
  const invoiceId = 'f7777777-7777-4777-8777-777777777777';
  const invoiceLineId = 'f8888888-8888-4888-8888-888888888888';
  const receiptId = 'f9999999-9999-4999-8999-999999999999';
  const receiptAllocationId = 'fa111111-1111-4111-8111-111111111111';
  const invoiceJournalId = 'fa222222-2222-4222-8222-222222222222';
  const invoiceDebitLineId = 'fa333333-3333-4333-8333-333333333333';
  const invoiceCreditLineId = 'fa444444-4444-4444-8444-444444444444';
  const receiptJournalId = 'fa555555-5555-4555-8555-555555555555';
  const receiptDebitLineId = 'fa666666-6666-4666-8666-666666666666';
  const receiptCreditLineId = 'fa777777-7777-4777-8777-777777777777';

  beforeAll(async () => {
    if (!pool) throw new Error('DATABASE_URL is required for this integration test.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyId]);
      await client.query("INSERT INTO app_users (id, email, display_name) VALUES ($1, $2, $3)", [userId, 'workflow@example.test', 'Workflow User']);
      await client.query("INSERT INTO companies (id, legal_name, display_name) VALUES ($1, $2, $3)", [companyId, 'Workflow Company', 'Workflow Company']);
      await client.query("INSERT INTO company_memberships (company_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')", [companyId, userId]);
      await client.query("INSERT INTO ledger_accounts (id, company_id, account_code, name, account_type, created_by) VALUES ($1, $2, 'WF-1100', 'Cash', 'asset', $3), ($4, $2, 'WF-1200', 'Accounts Receivable', 'asset', $3), ($5, $2, 'WF-4000', 'Sales Revenue', 'income', $3)", [cashAccountId, companyId, userId, receivableAccountId, revenueAccountId]);
      await client.query("INSERT INTO company_parties (id, company_id, party_code, name, party_type, is_active, created_by) VALUES ($1, $2, 'WF-CUST', 'Workflow Customer', 'customer', true, $3)", [customerId, companyId, userId]);
      await client.query("INSERT INTO sales_invoices (id, company_id, invoice_number, invoice_date, due_date, party_id, seller_gstin, buyer_gstin, place_of_supply_state_code, status, subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, created_by) VALUES ($1, $2, 'WF-INV-001', '2026-10-01', '2026-10-31', $3, '33AAAAA0000A1Z5', NULL, '33', 'issued', 10000, 0, 10000, 0, 0, 0, 10000, $4)", [invoiceId, companyId, customerId, userId]);
      await client.query("INSERT INTO sales_invoice_lines (id, company_id, invoice_id, line_number, item_id, description, quantity, unit_price_paise, discount_paise, gst_rate_bps, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise) VALUES ($1, $2, $3, 1, NULL, 'Workflow line', 1, 10000, 0, 0, 10000, 0, 0, 0, 10000)", [invoiceLineId, companyId, invoiceId]);
      await client.query("INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at) VALUES ($1, $2, 'WF-JE-001', '2026-10-01', 'Invoice posting', 'posted', 'invoice', $3, $3, now())", [invoiceJournalId, companyId, userId]);
      await client.query("INSERT INTO journal_lines (id, company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, 1, $4, 'Accounts receivable', 10000, 0), ($5, $2, $3, 2, $6, 'Sales revenue', 0, 10000)", [invoiceDebitLineId, companyId, invoiceJournalId, receivableAccountId, invoiceCreditLineId, revenueAccountId]);
      await client.query("INSERT INTO sales_posting_accounts (company_id, receivable_account_id, revenue_account_id) VALUES ($1, $2, $3)", [companyId, receivableAccountId, revenueAccountId]);
      await client.query("INSERT INTO sales_receipts (id, company_id, receipt_number, receipt_date, party_id, account_id, amount_paise, status, created_by, journal_entry_id) VALUES ($1, $2, 'WF-RC-001', '2026-10-10', $3, $4, 10000, 'posted', $5, $6)", [receiptId, companyId, customerId, cashAccountId, userId, receiptJournalId]);
      await client.query("INSERT INTO sales_receipt_allocations (id, company_id, receipt_id, invoice_id, allocated_paise) VALUES ($1, $2, $3, $4, 10000)", [receiptAllocationId, companyId, receiptId, invoiceId]);
      await client.query("INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at) VALUES ($1, $2, 'WF-JE-002', '2026-10-10', 'Receipt posting', 'posted', 'sales_receipt', $3, $3, now())", [receiptJournalId, companyId, userId]);
      await client.query("INSERT INTO journal_lines (id, company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, 1, $4, 'Cash', 10000, 0), ($5, $2, $3, 2, $6, 'Accounts receivable', 0, 10000)", [receiptDebitLineId, companyId, receiptJournalId, cashAccountId, receiptCreditLineId, receivableAccountId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyId]);
      await client.query('DELETE FROM sales_receipt_allocations WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM sales_receipts WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM journal_lines WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM journal_entries WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM sales_invoice_lines WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM sales_invoices WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM sales_posting_accounts WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM company_parties WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM ledger_accounts WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM company_memberships WHERE company_id = $1', [companyId]);
      await client.query('DELETE FROM companies WHERE id = $1', [companyId]);
      await client.query('DELETE FROM app_users WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('settles the issued invoice fully and keeps the combined journal balanced', async () => {
    if (!pool) throw new Error('DATABASE_URL is required for this integration test.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyId]);

      const outstanding = await client.query<{ outstanding: string }>(
        `SELECT (i.total_paise - COALESCE(SUM(CASE WHEN r.status = 'posted' THEN a.allocated_paise ELSE 0 END), 0))::text AS outstanding
           FROM sales_invoices i
           LEFT JOIN sales_receipt_allocations a ON a.company_id = i.company_id AND a.invoice_id = i.id
           LEFT JOIN sales_receipts r ON r.company_id = a.company_id AND r.id = a.receipt_id
          WHERE i.company_id = $1 AND i.id = $2
          GROUP BY i.id`,
        [companyId, invoiceId],
      );
      expect(outstanding.rows[0]?.outstanding).toBe('0');

      const balances = await client.query<{ debit: string; credit: string }>(
        `SELECT COALESCE(SUM(jl.debit_paise), 0)::text AS debit, COALESCE(SUM(jl.credit_paise), 0)::text AS credit
           FROM journal_lines jl
           JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
          WHERE jl.company_id = $1 AND je.id IN ($2, $3) AND je.status = 'posted'`,
        [companyId, invoiceJournalId, receiptJournalId],
      );
      expect(balances.rows[0]).toEqual({ debit: '20000', credit: '20000' });

      const receivable = await client.query<{ balance: string }>(
        `SELECT (COALESCE(SUM(jl.debit_paise), 0) - COALESCE(SUM(jl.credit_paise), 0))::text AS balance
           FROM journal_lines jl
           JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
          WHERE jl.company_id = $1 AND jl.account_id = $2 AND je.status = 'posted'`,
        [companyId, receivableAccountId],
      );
      expect(receivable.rows[0]?.balance).toBe('0');

      const cash = await client.query<{ balance: string }>(
        `SELECT (COALESCE(SUM(jl.debit_paise), 0) - COALESCE(SUM(jl.credit_paise), 0))::text AS balance
           FROM journal_lines jl
           JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
          WHERE jl.company_id = $1 AND jl.account_id = $2 AND je.status = 'posted'`,
        [companyId, cashAccountId],
      );
      expect(cash.rows[0]?.balance).toBe('10000');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
