import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/current-user';
import { TenantAccessService } from '../database/tenant-access.service';

const dashboardQuerySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

@Controller('companies/:companyId/dashboard')
export class DashboardController {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  @Get()
  async dashboard(
    @Param('companyId') companyId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = dashboardQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Dashboard parameters are invalid.');

    const now = new Date();
    const toDate = parsed.data.toDate ?? now.toISOString().slice(0, 10);
    const fromDate = parsed.data.fromDate ?? `${now.getUTCFullYear()}-01-01`;
    validateRange(fromDate, toDate);

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const [kpis, pnlTrend, revenueMix, expenseMix, receivables, payables, cashMovement, recentActivity] = await Promise.all([
        this.loadKpis(client, companyId, fromDate, toDate),
        this.loadPnlTrend(client, companyId, fromDate, toDate),
        this.loadAccountMix(client, companyId, fromDate, toDate, 'income'),
        this.loadAccountMix(client, companyId, fromDate, toDate, 'expense'),
        this.loadReceivables(client, companyId, toDate),
        this.loadPayables(client, companyId, toDate),
        this.loadCashMovement(client, companyId, fromDate, toDate),
        this.loadRecentActivity(client, companyId),
      ]);

      return {
        report: 'dashboard', companyId, fromDate, toDate, kpis,
        charts: { pnlTrend, revenueMix, expenseMix, receivablesAgeing: receivables.buckets, payablesAgeing: payables.buckets, cashMovement },
        receivables: { totalOutstandingPaise: receivables.totalOutstandingPaise, invoiceCount: receivables.documentCount },
        payables: { totalOutstandingPaise: payables.totalOutstandingPaise, billCount: payables.documentCount },
        recentActivity,
      };
    });
  }

  private async loadKpis(client: any, companyId: string, fromDate: string, toDate: string) {
    const result = await client.query(`
      WITH period AS (
        SELECT a.account_type,
          COALESCE(SUM(CASE WHEN a.account_type = 'income' THEN jl.credit_paise - jl.debit_paise ELSE jl.debit_paise - jl.credit_paise END), 0)::text AS amount_paise
        FROM ledger_accounts a
        JOIN journal_lines jl ON jl.company_id = a.company_id AND jl.account_id = a.id
        JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
        WHERE a.company_id = $1 AND je.status = 'posted' AND je.entry_date BETWEEN $2::date AND $3::date
          AND a.account_type IN ('income', 'expense')
        GROUP BY a.account_type
      ),
      balances AS (
        SELECT a.account_type,
          COALESCE(SUM(CASE WHEN a.account_type = 'asset' THEN jl.debit_paise - jl.credit_paise ELSE jl.credit_paise - jl.debit_paise END), 0)::text AS amount_paise
        FROM ledger_accounts a
        JOIN journal_lines jl ON jl.company_id = a.company_id AND jl.account_id = a.id
        JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
        WHERE a.company_id = $1 AND je.status = 'posted' AND je.entry_date <= $3::date
          AND a.account_type IN ('asset', 'liability', 'equity')
        GROUP BY a.account_type
      )
      SELECT
        COALESCE((SELECT amount_paise FROM period WHERE account_type = 'income'), '0') AS revenue_paise,
        COALESCE((SELECT amount_paise FROM period WHERE account_type = 'expense'), '0') AS expense_paise,
        COALESCE((SELECT amount_paise::bigint FROM period WHERE account_type = 'income'), 0) - COALESCE((SELECT amount_paise::bigint FROM period WHERE account_type = 'expense'), 0) AS net_profit_paise,
        COALESCE((SELECT amount_paise FROM balances WHERE account_type = 'asset'), '0') AS assets_paise,
        COALESCE((SELECT amount_paise FROM balances WHERE account_type = 'liability'), '0') AS liabilities_paise,
        COALESCE((SELECT amount_paise FROM balances WHERE account_type = 'equity'), '0') AS equity_paise,
        (SELECT COUNT(*)::text FROM journal_entries WHERE company_id = $1 AND status = 'posted' AND entry_date BETWEEN $2::date AND $3::date) AS transaction_count,
        (SELECT COUNT(*)::text FROM sales_invoices WHERE company_id = $1 AND status = 'issued' AND invoice_date BETWEEN $2::date AND $3::date) AS invoice_count,
        (SELECT COALESCE(SUM(total_cost_paise), 0)::text FROM inventory_valuation_balances WHERE company_id = $1) AS inventory_paise
    `, [companyId, fromDate, toDate]);

    const bankResult = await client.query(`
      SELECT COALESCE(SUM(jl.debit_paise - jl.credit_paise), 0)::text AS bank_paise
      FROM bank_accounts ba
      JOIN ledger_accounts a ON a.company_id = ba.company_id AND a.id = ba.ledger_account_id
      JOIN journal_lines jl ON jl.company_id = a.company_id AND jl.account_id = a.id
      JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
      WHERE ba.company_id = $1 AND ba.is_active = true AND je.status = 'posted' AND je.entry_date <= $2::date
    `, [companyId, toDate]);

    const row = result.rows[0];
    const revenue = BigInt(row.revenue_paise);
    const profit = BigInt(row.net_profit_paise);
    return {
      revenuePaise: row.revenue_paise,
      expensePaise: row.expense_paise,
      netProfitPaise: row.net_profit_paise.toString(),
      netMarginPercent: revenue === 0n ? '0' : ((Number(profit) / Number(revenue)) * 100).toFixed(2),
      assetsPaise: row.assets_paise,
      liabilitiesPaise: row.liabilities_paise,
      equityPaise: row.equity_paise,
      bankBalancePaise: bankResult.rows[0]?.bank_paise ?? '0',
      inventoryPaise: row.inventory_paise,
      transactionCount: row.transaction_count,
      invoiceCount: row.invoice_count,
    };
  }

  private async loadPnlTrend(client: any, companyId: string, fromDate: string, toDate: string) {
    const result = await client.query(`
      WITH months AS (
        SELECT generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month')::date AS month
      ), totals AS (
        SELECT date_trunc('month', je.entry_date)::date AS month,
          COALESCE(SUM(CASE WHEN a.account_type = 'income' THEN jl.credit_paise - jl.debit_paise ELSE 0 END), 0)::bigint AS revenue_paise,
          COALESCE(SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit_paise - jl.credit_paise ELSE 0 END), 0)::bigint AS expense_paise
        FROM journal_entries je
        JOIN journal_lines jl ON jl.company_id = je.company_id AND jl.journal_entry_id = je.id
        JOIN ledger_accounts a ON a.company_id = jl.company_id AND a.id = jl.account_id
        WHERE je.company_id = $1 AND je.status = 'posted' AND je.entry_date BETWEEN $2::date AND $3::date AND a.account_type IN ('income', 'expense')
        GROUP BY date_trunc('month', je.entry_date)::date
      )
      SELECT to_char(m.month, 'Mon YYYY') AS label, COALESCE(t.revenue_paise, 0)::text AS revenue_paise,
        COALESCE(t.expense_paise, 0)::text AS expense_paise,
        (COALESCE(t.revenue_paise, 0) - COALESCE(t.expense_paise, 0))::text AS profit_paise
      FROM months m LEFT JOIN totals t ON t.month = m.month ORDER BY m.month
    `, [companyId, fromDate, toDate]);
    return result.rows;
  }

  private async loadAccountMix(client: any, companyId: string, fromDate: string, toDate: string, type: 'income' | 'expense') {
    const result = await client.query(`
      SELECT a.account_code AS code, a.name AS label,
        COALESCE(SUM(CASE WHEN a.account_type = 'income' THEN jl.credit_paise - jl.debit_paise ELSE jl.debit_paise - jl.credit_paise END), 0)::text AS amount_paise
      FROM ledger_accounts a
      JOIN journal_lines jl ON jl.company_id = a.company_id AND jl.account_id = a.id
      JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id
      WHERE a.company_id = $1 AND a.account_type = $4 AND je.status = 'posted' AND je.entry_date BETWEEN $2::date AND $3::date
      GROUP BY a.id, a.account_code, a.name
      ORDER BY SUM(CASE WHEN a.account_type = 'income' THEN jl.credit_paise - jl.debit_paise ELSE jl.debit_paise - jl.credit_paise END) DESC LIMIT 6
    `, [companyId, fromDate, toDate, type]);
    return result.rows;
  }

  private async loadReceivables(client: any, companyId: string, asOfDate: string) {
    const result = await client.query(`
      WITH allocations AS (
        SELECT a.invoice_id, SUM(a.allocated_paise)::bigint AS allocated_paise
        FROM sales_receipt_allocations a JOIN sales_receipts r ON r.company_id = a.company_id AND r.id = a.receipt_id
        WHERE a.company_id = $1 AND r.status = 'posted' AND r.receipt_date <= $2::date GROUP BY a.invoice_id
      ), ageing AS (
        SELECT CASE WHEN COALESCE(i.due_date, i.invoice_date) >= $2::date THEN 'not-due'
          WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 1 AND 30 THEN '1-30'
          WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 31 AND 60 THEN '31-60'
          WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 61 AND 90 THEN '61-90' ELSE '90-plus' END AS bucket,
          COALESCE(SUM(i.total_paise - COALESCE(a.allocated_paise, 0)), 0)::text AS amount_paise, COUNT(*)::text AS document_count
        FROM sales_invoices i LEFT JOIN allocations a ON a.invoice_id = i.id
        WHERE i.company_id = $1 AND i.status = 'issued' AND i.invoice_date <= $2::date AND i.total_paise > COALESCE(a.allocated_paise, 0)
        GROUP BY 1
      )
      SELECT bucket, amount_paise, document_count
      FROM ageing
      ORDER BY CASE bucket WHEN 'not-due' THEN 1 WHEN '1-30' THEN 2 WHEN '31-60' THEN 3 WHEN '61-90' THEN 4 ELSE 5 END
    `, [companyId, asOfDate]);
    return aggregateBuckets(result.rows);
  }

  private async loadPayables(client: any, companyId: string, asOfDate: string) {
    const result = await client.query(`
      WITH allocations AS (
        SELECT a.bill_id, SUM(a.allocated_paise)::bigint AS allocated_paise
        FROM supplier_payment_allocations a JOIN supplier_payments p ON p.company_id = a.company_id AND p.id = a.payment_id
        WHERE a.company_id = $1 AND p.status = 'posted' AND p.payment_date <= $2::date GROUP BY a.bill_id
      ), ageing AS (
        SELECT CASE WHEN COALESCE(b.due_date, b.bill_date) >= $2::date THEN 'not-due'
          WHEN ($2::date - COALESCE(b.due_date, b.bill_date)) BETWEEN 1 AND 30 THEN '1-30'
          WHEN ($2::date - COALESCE(b.due_date, b.bill_date)) BETWEEN 31 AND 60 THEN '31-60'
          WHEN ($2::date - COALESCE(b.due_date, b.bill_date)) BETWEEN 61 AND 90 THEN '61-90' ELSE '90-plus' END AS bucket,
          COALESCE(SUM(b.total_paise - COALESCE(a.allocated_paise, 0)), 0)::text AS amount_paise, COUNT(*)::text AS document_count
        FROM purchase_bills b LEFT JOIN allocations a ON a.bill_id = b.id
        WHERE b.company_id = $1 AND b.status = 'received' AND b.bill_date <= $2::date AND b.total_paise > COALESCE(a.allocated_paise, 0)
        GROUP BY 1
      )
      SELECT bucket, amount_paise, document_count
      FROM ageing
      ORDER BY CASE bucket WHEN 'not-due' THEN 1 WHEN '1-30' THEN 2 WHEN '31-60' THEN 3 WHEN '61-90' THEN 4 ELSE 5 END
    `, [companyId, asOfDate]);
    return aggregateBuckets(result.rows);
  }

  private async loadCashMovement(client: any, companyId: string, fromDate: string, toDate: string) {
    const result = await client.query(`
      WITH months AS (
        SELECT generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month')::date AS month
      ), movements AS (
        SELECT date_trunc('month', transaction_date)::date AS month,
          COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount_paise ELSE 0 END), 0)::bigint AS inflow_paise,
          COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount_paise ELSE 0 END), 0)::bigint AS outflow_paise
        FROM bank_statement_transactions WHERE company_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
        GROUP BY date_trunc('month', transaction_date)::date
      )
      SELECT to_char(m.month, 'Mon YYYY') AS label, COALESCE(x.inflow_paise, 0)::text AS inflow_paise,
        COALESCE(x.outflow_paise, 0)::text AS outflow_paise, (COALESCE(x.inflow_paise, 0) - COALESCE(x.outflow_paise, 0))::text AS net_paise
      FROM months m LEFT JOIN movements x ON x.month = m.month ORDER BY m.month
    `, [companyId, fromDate, toDate]);
    return result.rows;
  }

  private async loadRecentActivity(client: any, companyId: string) {
    const result = await client.query(`
      SELECT je.id::text AS id, je.entry_number AS reference, je.entry_date::text AS date, je.description, je.source_type AS source
      FROM journal_entries je WHERE je.company_id = $1 AND je.status = 'posted'
      ORDER BY je.entry_date DESC, je.created_at DESC LIMIT 8
    `, [companyId]);
    return result.rows;
  }
}

function aggregateBuckets(rows: Array<{ bucket: string; amount_paise: string; document_count: string }>) {
  const buckets: Record<string, string> = { 'not-due': '0', '1-30': '0', '31-60': '0', '61-90': '0', '90-plus': '0' };
  let total = 0n;
  let documentCount = 0;
  for (const row of rows) {
    buckets[row.bucket] = row.amount_paise;
    total += BigInt(row.amount_paise);
    documentCount += Number(row.document_count);
  }
  return { buckets, totalOutstandingPaise: total.toString(), documentCount: String(documentCount) };
}

function validateRange(fromDate: string, toDate: string): void {
  for (const [field, value] of [['fromDate', fromDate], ['toDate', toDate]] as const) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} must be a valid calendar date.`);
  }
  if (fromDate > toDate) throw new BadRequestException('fromDate must be on or before toDate.');
}
