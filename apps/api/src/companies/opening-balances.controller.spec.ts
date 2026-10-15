import { describe, expect, it, vi } from 'vitest';
import { OpeningBalancesController } from './opening-balances.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const accountAsset = 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const accountEquity = 'b20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const itemId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const warehouseId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('SELECT id FROM ledger_accounts')) {
      return { rows: (values?.[1] as string[]).map((id) => ({ id })) };
    }
    if (sql.includes('SELECT id, account_type FROM ledger_accounts')) {
      return { rows: [{ id: accountAsset, account_type: 'asset' }, { id: accountEquity, account_type: 'equity' }] };
    }
    if (sql.includes('SELECT id FROM company_items')) return { rows: [{ id: itemId }] };
    if (sql.includes('SELECT id FROM company_warehouses')) return { rows: [{ id: warehouseId }] };
    if (sql.includes('INSERT INTO journal_entries')) {
      return { rows: [{ id: values?.[0], company_id: companyId, entry_number: values?.[2], status: 'draft' }] };
    }
    if (sql.includes('UPDATE journal_entries')) {
      return { rows: [{ id: values?.[1], company_id: companyId, entry_number: 'OPEN-001', status: 'posted' }] };
    }
    if (sql.includes('INSERT INTO opening_inventory')) {
      return { rows: [{ id: 'inventory-row', itemId, warehouseId, totalValuePaise: values?.[7] }] };
    }
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new OpeningBalancesController(tenantAccess as never, audit as never), client, tenantAccess, audit };
}

describe('OpeningBalancesController', () => {
  it('posts balanced opening ledger balances and audits in the same transaction', async () => {
    const { controller, client, audit } = setup();
    const result = await controller.createOpeningBalances(companyId, {
      entryNumber: 'OPEN-001',
      openingDate: '2026-04-01',
      lines: [
        { accountId: accountAsset, debitPaise: '10000', creditPaise: '0' },
        { accountId: accountEquity, debitPaise: '0', creditPaise: '10000' },
      ],
    }, request) as { entry: { id: string; status: string } };
    expect(result.entry.status).toBe('posted');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("source_type"), expect.any(Array));
    expect(audit.record).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'OPENING_BALANCES_POSTED',
      entityId: result.entry.id,
    }));
  });

  it('rejects unbalanced opening balances before starting a tenant transaction', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.createOpeningBalances(companyId, {
      entryNumber: 'OPEN-001',
      openingDate: '2026-04-01',
      lines: [
        { accountId: accountAsset, debitPaise: '10000', creditPaise: '0' },
        { accountId: accountEquity, debitPaise: '0', creditPaise: '9999' },
      ],
    }, request)).rejects.toThrow('Opening balance details are invalid or unbalanced.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('values opening inventory in integer paise with half-up rounding and posts a balanced journal', async () => {
    const { controller, audit } = setup();
    const result = await controller.createOpeningInventory(companyId, {
      entryNumber: 'OPEN-001',
      openingDate: '2026-04-01',
      inventoryAssetAccountId: accountAsset,
      openingEquityAccountId: accountEquity,
      items: [{ itemId, warehouseId, quantity: '1.5', unitCostPaise: '101' }],
    }, request) as { entry: { id: string; status: string }; totalValuePaise: string };
    expect(result.entry.status).toBe('posted');
    expect(result.totalValuePaise).toBe('152');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'OPENING_INVENTORY_POSTED',
      entityId: result.entry.id,
      metadata: expect.objectContaining({ totalValuePaise: '152' }),
    }));
  });

  it('rejects zero quantity before starting a tenant transaction', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.createOpeningInventory(companyId, {
      entryNumber: 'OPEN-001',
      openingDate: '2026-04-01',
      inventoryAssetAccountId: accountAsset,
      openingEquityAccountId: accountEquity,
      items: [{ itemId, warehouseId, quantity: '0', unitCostPaise: '101' }],
    }, request)).rejects.toThrow('Opening inventory details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
