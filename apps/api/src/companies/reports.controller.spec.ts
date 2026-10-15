import { describe, expect, it, vi } from 'vitest';
import { ReportsController } from './reports.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function setup(rows: Array<{
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_paise: string;
  credit_paise: string;
}>) {
  const query = vi.fn(async () => ({ rows }));
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  return { controller: new ReportsController(tenantAccess as never), client, tenantAccess };
}

const request = { user: { sub: userId } } as never;

describe('ReportsController', () => {
  it('builds debit and credit trial-balance columns from posted journal totals', async () => {
    const { controller, client, tenantAccess } = setup([
      { account_id: 'a1', account_code: '1000', account_name: 'Bank', account_type: 'asset', debit_paise: '15000', credit_paise: '2000' },
      { account_id: 'a2', account_code: '4000', account_name: 'Sales', account_type: 'income', debit_paise: '0', credit_paise: '13000' },
    ]);

    const result = await controller.trialBalance(companyId, { asOfDate: '2026-10-15' }, request);

    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("je.status = 'posted'"), [companyId, '2026-10-15']);
    expect(result.totals).toEqual({ debitPaise: '13000', creditPaise: '13000' });
    expect(result.balanced).toBe(true);
    expect(result.rows[0].debitBalancePaise).toBe('13000');
    expect(result.rows[0].creditBalancePaise).toBe('0');
    expect(result.rows[1].debitBalancePaise).toBe('0');
    expect(result.rows[1].creditBalancePaise).toBe('13000');
  });

  it('defaults the as-of date when omitted', async () => {
    const { controller, client } = setup([]);
    await controller.trialBalance(companyId, {}, request);
    expect(client.query).toHaveBeenCalledWith(expect.any(String), [companyId, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
  });

  it('rejects invalid calendar dates', async () => {
    const { controller, tenantAccess } = setup([]);
    await expect(controller.trialBalance(companyId, { asOfDate: '2026-02-30' }, request))
      .rejects.toThrow('asOfDate must be a valid calendar date.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
