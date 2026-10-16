import { describe, expect, it, vi } from 'vitest';
import { DashboardController } from './dashboard.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function setup() {
  let activeQueries = 0;
  let maxConcurrentQueries = 0;

  const query = vi.fn(async (sql: string) => {
    activeQueries += 1;
    maxConcurrentQueries = Math.max(maxConcurrentQueries, activeQueries);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1));

      if (sql.includes('inventory_valuation_balances')) {
        return {
          rows: [{
            revenue_paise: '100000',
            expense_paise: '40000',
            net_profit_paise: '60000',
            assets_paise: '150000',
            liabilities_paise: '50000',
            equity_paise: '100000',
            transaction_count: '3',
            invoice_count: '2',
            inventory_paise: '25000',
          }],
        };
      }

      if (sql.includes('FROM bank_accounts')) {
        return { rows: [{ bank_paise: '75000' }] };
      }

      if (sql.includes('FROM bank_statement_transactions')) {
        return { rows: [{ label: 'Oct 2026', inflow_paise: '50000', outflow_paise: '20000', net_paise: '30000' }] };
      }

      if (sql.includes('FROM sales_invoices i')) {
        return { rows: [{ bucket: '1-30', amount_paise: '12000', document_count: '1' }] };
      }

      if (sql.includes('FROM purchase_bills b')) {
        return { rows: [{ bucket: 'not-due', amount_paise: '8000', document_count: '1' }] };
      }

      if (sql.includes('a.account_type = $4')) {
        return { rows: [{ code: '4000', label: 'Sales', amount_paise: '100000' }] };
      }

      if (sql.includes('date_trunc(\'month\', je.entry_date)')) {
        return { rows: [{ label: 'Oct 2026', revenue_paise: '100000', expense_paise: '40000', profit_paise: '60000' }] };
      }

      if (sql.includes('je.memo AS description')) {
        return { rows: [{ id: 'journal-1', reference: 'JE-001', date: '2026-10-16', description: 'Invoice posting', source: 'invoice' }] };
      }

      throw new Error(`Unexpected dashboard query: ${sql}`);
    } finally {
      activeQueries -= 1;
    }
  });

  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };

  return {
    controller: new DashboardController(tenantAccess as never),
    client,
    tenantAccess,
    getMaxConcurrentQueries: () => maxConcurrentQueries,
  };
}

const request = { user: { sub: userId } } as never;

describe('DashboardController', () => {
  it('reads dashboard data sequentially on one tenant transaction client', async () => {
    const { controller, getMaxConcurrentQueries } = setup();

    const result = await controller.dashboard(
      companyId,
      { fromDate: '2026-10-01', toDate: '2026-10-16' },
      request,
    );

    expect(getMaxConcurrentQueries()).toBe(1);
    expect(result.kpis.netProfitPaise).toBe('60000');
    expect(result.charts.pnlTrend[0].profit_paise).toBe('60000');
  });

  it('maps journal entry memo to the dashboard description contract', async () => {
    const { controller, client } = setup();

    const result = await controller.dashboard(
      companyId,
      { fromDate: '2026-10-01', toDate: '2026-10-16' },
      request,
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('je.memo AS description'),
      [companyId],
    );
    expect(result.recentActivity).toEqual([
      { id: 'journal-1', reference: 'JE-001', date: '2026-10-16', description: 'Invoice posting', source: 'invoice' },
    ]);
  });

  it('rejects invalid date ranges before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = setup();

    await expect(controller.dashboard(companyId, { fromDate: '2026-02-30', toDate: '2026-03-01' }, request))
      .rejects.toThrow('fromDate must be a valid calendar date.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
