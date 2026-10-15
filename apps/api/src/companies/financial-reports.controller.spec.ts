import { describe, expect, it, vi } from 'vitest';
import { FinancialReportsController } from './financial-reports.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const request = { user: { sub: userId } } as never;

type Row = { accountId: string; accountCode: string; accountName: string; accountType: string; debitPaise: string; creditPaise: string };

function setup(rows: Row[], followUpRows: Row[] = rows) {
  const query = vi.fn(async () => ({ rows: query.mock.calls.length === 1 ? rows : followUpRows }));
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  return { controller: new FinancialReportsController(tenantAccess as never), client, tenantAccess };
}

describe('FinancialReportsController', () => {
  it('calculates profit and loss from income and expense balances', async () => {
    const { controller } = setup([
      { accountId: '1', accountCode: '4000', accountName: 'Sales', accountType: 'income', debitPaise: '1000', creditPaise: '10000' },
      { accountId: '2', accountCode: '5000', accountName: 'Rent', accountType: 'expense', debitPaise: '2500', creditPaise: '0' },
    ]);
    const result = await controller.profitAndLoss(companyId, { fromDate: '2026-01-01', toDate: '2026-10-15' }, request);
    expect(result.incomePaise).toBe('9000');
    expect(result.expensePaise).toBe('2500');
    expect(result.netProfitPaise).toBe('6500');
  });

  it('calculates balance sheet and retained earnings from posted journals', async () => {
    const balanceSheetRows = [
      { accountId: '1', accountCode: '1000', accountName: 'Bank', accountType: 'asset', debitPaise: '20000', creditPaise: '0' },
      { accountId: '2', accountCode: '2000', accountName: 'Payable', accountType: 'liability', debitPaise: '0', creditPaise: '5000' },
      { accountId: '3', accountCode: '3000', accountName: 'Capital', accountType: 'equity', debitPaise: '0', creditPaise: '10000' },
    ];
    const profitAndLossRows = [
      { accountId: '4', accountCode: '4000', accountName: 'Sales', accountType: 'income', debitPaise: '0', creditPaise: '5000' },
      { accountId: '5', accountCode: '5000', accountName: 'Rent', accountType: 'expense', debitPaise: '0', creditPaise: '0' },
    ];
    const { controller, client } = setup(balanceSheetRows, profitAndLossRows);
    const result = await controller.balanceSheet(companyId, { asOfDate: '2026-10-15' }, request);
    expect(result.totals).toEqual({ assetPaise: '20000', liabilityPaise: '5000', equityPaise: '10000', retainedEarningsPaise: '5000', liabilitiesAndEquityPaise: '20000' });
    expect(result.balanced).toBe(true);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid reporting range before opening a transaction', async () => {
    const { controller, tenantAccess } = setup([]);
    await expect(controller.profitAndLoss(companyId, { fromDate: '2026-02-30', toDate: '2026-03-01' }, request)).rejects.toThrow('fromDate must be a valid calendar date.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
