import { describe, expect, it, vi } from 'vitest';
import { ItemsController, WarehousesController } from './items-warehouses.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function makeController(Type: typeof ItemsController | typeof WarehousesController,
  work: (callback: (...args: any[]) => Promise<unknown>) => Promise<unknown>) {
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (...args: any[]) => Promise<unknown>) => work(callback)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new Type(tenantAccess as never, audit as never), tenantAccess, audit };
}

describe('ItemsController', () => {
  it('lists items in an authorized company transaction', async () => {
    const item = { id: 'item-1', item_code: 'SKU-01', name: 'Notebook' };
    const { controller, tenantAccess } = makeController(ItemsController, async (callback) => callback({ query: vi.fn(async () => ({ rows: [item] })) }));
    const result = await (controller as ItemsController).listItems(companyId, 'goods', 'true', { user: { sub: userId } } as never);
    expect(result.items).toEqual([item]);
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
  });
  it('rejects invalid item filters before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(ItemsController, async () => { throw new Error('should not be called'); });
    await expect((controller as ItemsController).listItems(companyId, 'asset', undefined, { user: { sub: userId } } as never)).rejects.toThrow('Item type filter is invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
  it('creates an item and records an audit event in the same transaction', async () => {
    const item = { id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', company_id: companyId, item_code: 'SKU-01', name: 'Notebook',
      item_type: 'goods', hsn_sac: null, unit_code: 'unit', gst_rate_bps: 1800, selling_price_paise: '12500',
      purchase_price_paise: '8000', track_inventory: true, is_active: true, created_at: new Date(), updated_at: new Date() };
    const { controller, audit } = makeController(ItemsController, async (callback) => callback({ query: vi.fn(async () => ({ rows: [item] })) }));
    const result = await (controller as ItemsController).createItem(companyId, { itemCode: 'sku-01', name: 'Notebook', gstRateBps: 1800, sellingPricePaise: '12500', purchasePricePaise: '8000' }, { user: { sub: userId } } as never);
    expect(result.item).toEqual(item);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorUserId: userId, action: 'COMPANY_ITEM_CREATED', entityType: 'company_item', entityId: item.id, metadata: { companyId, itemCode: 'SKU-01', itemType: 'goods' } }));
  });
  it('rejects services configured to track inventory', async () => {
    const { controller, tenantAccess } = makeController(ItemsController, async () => { throw new Error('should not be called'); });
    await expect((controller as ItemsController).createItem(companyId, { itemCode: 'CONSULT', name: 'Consulting', itemType: 'service', trackInventory: true }, { user: { sub: userId } } as never)).rejects.toThrow('Item details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});

describe('WarehousesController', () => {
  it('lists warehouses in an authorized company transaction', async () => {
    const warehouse = { id: 'warehouse-1', warehouse_code: 'MAIN', name: 'Main warehouse' };
    const { controller, tenantAccess } = makeController(WarehousesController, async (callback) => callback({ query: vi.fn(async () => ({ rows: [warehouse] })) }));
    const result = await (controller as WarehousesController).listWarehouses(companyId, 'true', { user: { sub: userId } } as never);
    expect(result.warehouses).toEqual([warehouse]);
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
  });
  it('rejects a branch that is not in the current company', async () => {
    const { controller, audit } = makeController(WarehousesController, async (callback) => callback({ query: vi.fn(async () => ({ rows: [] })) }));
    await expect((controller as WarehousesController).createWarehouse(companyId, { warehouseCode: 'MAIN', name: 'Main warehouse', branchId: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2' }, { user: { sub: userId } } as never)).rejects.toThrow('Branch must belong to this company.');
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('creates a warehouse and records an audit event in the same transaction', async () => {
    const warehouse = { id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', company_id: companyId, branch_id: null, warehouse_code: 'MAIN', name: 'Main warehouse', address: {}, is_active: true, created_at: new Date(), updated_at: new Date() };
    const { controller, audit } = makeController(WarehousesController, async (callback) => callback({ query: vi.fn(async () => ({ rows: [warehouse] })) }));
    const result = await (controller as WarehousesController).createWarehouse(companyId, { warehouseCode: 'main', name: 'Main warehouse' }, { user: { sub: userId } } as never);
    expect(result.warehouse).toEqual(warehouse);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorUserId: userId, action: 'COMPANY_WAREHOUSE_CREATED', entityType: 'company_warehouse', entityId: warehouse.id, metadata: { companyId, warehouseCode: 'MAIN', branchId: null } }));
  });
});
