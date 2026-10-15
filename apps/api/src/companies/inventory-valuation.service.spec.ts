import { describe, expect, it, vi } from 'vitest';
import { InventoryValuationService } from './inventory-valuation.service';

function clientFor(rows: unknown[][]) {
  let index = 0;
  return { query: vi.fn(async () => ({ rows: rows[index++] ?? [] })) } as any;
}

describe('InventoryValuationService', () => {
  it('receives tracked stock into the configured warehouse', async () => {
    const client = clientFor([
      [{ default_warehouse_id: 'warehouse-1', is_active: true }],
      [{ item_type: 'goods', track_inventory: true, is_active: true }],
      [{ id: 'warehouse-1', is_active: true }],
      [],
      [],
      [],
    ]);
    const service = new InventoryValuationService();

    const result = await service.receivePurchaseLines(client, 'company-1', [{ id: 'line-1', item_id: 'item-1', warehouse_id: null, quantity: '2.5', taxable_paise: '1000' }], 'journal-1', 'user-1', '2026-10-16');

    expect(result.movements).toEqual([{ itemId: 'item-1', warehouseId: 'warehouse-1', quantity: '2.5', totalCostPaise: '1000' }]);
    expect(client.query).toHaveBeenCalled();
  });

  it('uses weighted average cost and leaves the residual pool after a sale', async () => {
    const client = clientFor([
      [{ default_warehouse_id: 'warehouse-1', is_active: true }],
      [{ item_type: 'goods', track_inventory: true, is_active: true }],
      [{ id: 'balance-1', quantity: '10', total_cost_paise: '2500' }],
      [],
      [],
    ]);
    const service = new InventoryValuationService();

    const result = await service.issueSaleLines(client, 'company-1', [{ id: 'line-1', item_id: 'item-1', warehouse_id: null, quantity: '4', taxable_paise: '4000' }], 'journal-1', 'user-1', '2026-10-16');

    expect(result.totalCogsPaise).toBe('1000');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE inventory_valuation_balances'), ['company-1', 'item-1', 'warehouse-1', '6', '1500']);
  });

  it('rejects a sale that exceeds available quantity', async () => {
    const client = clientFor([
      [{ default_warehouse_id: 'warehouse-1', is_active: true }],
      [{ item_type: 'goods', track_inventory: true, is_active: true }],
      [{ id: 'balance-1', quantity: '2', total_cost_paise: '500' }],
    ]);
    const service = new InventoryValuationService();

    await expect(service.issueSaleLines(client, 'company-1', [{ id: 'line-1', item_id: 'item-1', warehouse_id: null, quantity: '3', taxable_paise: '3000' }], 'journal-1', 'user-1', '2026-10-16')).rejects.toThrow('Insufficient inventory');
  });
});
