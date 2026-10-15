import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

const accountSchema = z.object({
  inventoryAssetAccountId: z.string().uuid(),
  cogsAccountId: z.string().uuid(),
  defaultWarehouseId: z.string().uuid(),
  inventoryAdjustmentAccountId: z.string().uuid(),
}).strict();

const adjustmentSchema = z.object({
  adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  direction: z.enum(['increase', 'decrease']),
  quantity: z.string().regex(/^\d+(\.\d{1,6})?$/),
  unitCostPaise: z.string().regex(/^\d+$/),
  reason: z.string().trim().min(3).max(500),
}).strict();

function dateIsValid(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

@Controller('companies/:companyId/inventory')
export class InventoryValuationController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('posting-accounts')
  async getPostingAccounts(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT inventory_asset_account_id AS "inventoryAssetAccountId", cogs_account_id AS "cogsAccountId", default_warehouse_id AS "defaultWarehouseId", inventory_adjustment_account_id AS "inventoryAdjustmentAccountId" FROM inventory_posting_accounts WHERE company_id = $1`, [companyId]);
      return { postingAccounts: result.rows[0] ?? null };
    });
  }

  @Put('posting-accounts')
  @CompanyRoles('owner', 'admin')
  async configurePostingAccounts(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Inventory posting account configuration is invalid.');
    const data = parsed.data;
    const ids = [data.inventoryAssetAccountId, data.cogsAccountId, data.inventoryAdjustmentAccountId];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Inventory posting accounts must be distinct.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const accounts = await client.query<{ id: string; account_type: string; is_active: boolean }>(
        'SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, ids]);
      if (accounts.rows.length !== 3 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Every inventory posting account must be active in this company.');
      const byId = new Map(accounts.rows.map((row) => [row.id, row.account_type]));
      if (byId.get(data.inventoryAssetAccountId) !== 'asset') throw new BadRequestException('inventoryAssetAccountId must reference an active asset account.');
      if (byId.get(data.cogsAccountId) !== 'expense') throw new BadRequestException('cogsAccountId must reference an active expense account.');
      if (!['expense', 'income'].includes(byId.get(data.inventoryAdjustmentAccountId) ?? '')) throw new BadRequestException('inventoryAdjustmentAccountId must reference an income or expense account.');
      const warehouse = await client.query<{ id: string; is_active: boolean }>('SELECT id, is_active FROM company_warehouses WHERE company_id = $1 AND id = $2', [companyId, data.defaultWarehouseId]);
      if (!warehouse.rows[0] || !warehouse.rows[0].is_active) throw new BadRequestException('defaultWarehouseId must reference an active warehouse in this company.');
      await client.query(`INSERT INTO inventory_posting_accounts (company_id, inventory_asset_account_id, cogs_account_id, default_warehouse_id, inventory_adjustment_account_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (company_id) DO UPDATE SET inventory_asset_account_id = EXCLUDED.inventory_asset_account_id, cogs_account_id = EXCLUDED.cogs_account_id, default_warehouse_id = EXCLUDED.default_warehouse_id, inventory_adjustment_account_id = EXCLUDED.inventory_adjustment_account_id, updated_at = now()`, [companyId, data.inventoryAssetAccountId, data.cogsAccountId, data.defaultWarehouseId, data.inventoryAdjustmentAccountId, userId]);
      await this.audit.record(client, { actorUserId: userId, action: 'INVENTORY_POSTING_ACCOUNTS_CONFIGURED', entityType: 'inventory_posting_accounts', entityId: companyId, metadata: { companyId, defaultWarehouseId: data.defaultWarehouseId } });
      return { postingAccounts: data };
    });
  }

  @Get('valuation')
  async valuation(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT b.item_id AS "itemId", i.item_code AS "itemCode", i.name AS "itemName", b.warehouse_id AS "warehouseId", w.warehouse_code AS "warehouseCode", w.name AS "warehouseName", b.quantity::text AS quantity, b.total_cost_paise::text AS "totalCostPaise", CASE WHEN b.quantity = 0 THEN '0' ELSE round((b.total_cost_paise / b.quantity), 6)::text END AS "averageCostPaise" FROM inventory_valuation_balances b JOIN company_items i ON i.company_id = b.company_id AND i.id = b.item_id JOIN company_warehouses w ON w.company_id = b.company_id AND w.id = b.warehouse_id WHERE b.company_id = $1 ORDER BY i.item_code, w.warehouse_code`, [companyId]);
      const totalCostPaise = result.rows.reduce((sum: bigint, row: { totalCostPaise: string }) => sum + BigInt(row.totalCostPaise), 0n).toString();
      return { balances: result.rows, totalCostPaise };
    });
  }

  @Get('adjustments')
  async listAdjustments(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT id, adjustment_number AS "adjustmentNumber", adjustment_date AS "adjustmentDate", item_id AS "itemId", warehouse_id AS "warehouseId", direction, quantity::text AS quantity, unit_cost_paise::text AS "unitCostPaise", total_cost_paise::text AS "totalCostPaise", reason, status, journal_entry_id AS "journalEntryId", reversal_of_id AS "reversalOfId", created_at AS "createdAt" FROM inventory_adjustments WHERE company_id = $1 ORDER BY adjustment_number DESC`, [companyId]);
      return { adjustments: result.rows };
    });
  }

  @Post('adjustments')
  @CompanyRoles('owner', 'admin', 'accountant')
  async createAdjustment(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = adjustmentSchema.safeParse(body);
    if (!parsed.success || !dateIsValid(parsed.data.adjustmentDate)) throw new BadRequestException('Inventory adjustment is invalid.');
    const data = parsed.data;

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => this.postAdjustment(client, companyId, userId, data, null));
  }

  @Post('adjustments/:adjustmentId/reverse')
  @CompanyRoles('owner', 'admin', 'accountant')
  async reverseAdjustment(@Param('companyId') companyId: string, @Param('adjustmentId') adjustmentId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<{ id: string; adjustment_date: string; item_id: string; warehouse_id: string; direction: 'increase' | 'decrease'; quantity: string; unit_cost_paise: string; total_cost_paise: string; status: string; reason: string }>('SELECT id, adjustment_date, item_id, warehouse_id, direction, quantity::text, unit_cost_paise::text, total_cost_paise::text, status, reason FROM inventory_adjustments WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, adjustmentId]);
      const original = result.rows[0];
      if (!original) throw new BadRequestException('Inventory adjustment was not found.');
      if (original.status !== 'posted') throw new ConflictException('Only a posted inventory adjustment can be reversed.');
      const opposite = original.direction === 'increase' ? 'decrease' : 'increase';
      return this.postAdjustment(client, companyId, userId, { adjustmentDate: original.adjustment_date, itemId: original.item_id, warehouseId: original.warehouse_id, direction: opposite, quantity: original.quantity, unitCostPaise: original.unit_cost_paise, reason: `Reversal of adjustment ${adjustmentId}: ${original.reason}` }, adjustmentId, original);
    });
  }

  private async postAdjustment(client: PoolClient, companyId: string, userId: string, data: z.infer<typeof adjustmentSchema>, reversalOfId: string | null, original?: { id: string; total_cost_paise: string }) {
    const config = await client.query<{ inventory_asset_account_id: string; inventory_adjustment_account_id: string | null }>('SELECT inventory_asset_account_id, inventory_adjustment_account_id FROM inventory_posting_accounts WHERE company_id = $1', [companyId]);
    if (!config.rows[0]?.inventory_adjustment_account_id) throw new BadRequestException('Configure the inventory adjustment account before posting stock adjustments.');
    const warehouseResult = await client.query<{ id: string; is_active: boolean }>('SELECT id, is_active FROM company_warehouses WHERE company_id = $1 AND id = $2', [companyId, data.warehouseId]);
    if (!warehouseResult.rows[0] || !warehouseResult.rows[0].is_active) throw new BadRequestException('The selected inventory warehouse is inactive or missing.');
    const itemResult = await client.query<{ item_type: string; track_inventory: boolean; is_active: boolean }>('SELECT item_type, track_inventory, is_active FROM company_items WHERE company_id = $1 AND id = $2', [companyId, data.itemId]);
    const item = itemResult.rows[0];
    if (!item?.is_active || item.item_type !== 'goods' || !item.track_inventory) throw new BadRequestException('Inventory adjustments require an active tracked goods item.');

    const quantityScaled = BigInt(data.quantity.split('.')[0]) * 1000000n + BigInt((data.quantity.split('.')[1] ?? '').padEnd(6, '0') || '0');
    if (quantityScaled <= 0n) throw new BadRequestException('Adjustment quantity must be positive.');
    const unitCost = BigInt(data.unitCostPaise);
    const totalCost = (unitCost * quantityScaled + 500000n) / 1000000n;
    if (totalCost <= 0n) throw new BadRequestException('Adjustment total cost must be positive.');
    if (reversalOfId && original && totalCost.toString() !== original.total_cost_paise) throw new BadRequestException('Adjustment reversal cost is inconsistent with the original adjustment.');

    const balance = await client.query<{ id: string; quantity: string; total_cost_paise: string }>('SELECT id, quantity::text, total_cost_paise::text FROM inventory_valuation_balances WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3 FOR UPDATE', [companyId, data.itemId, data.warehouseId]);
    const currentQty = balance.rows[0] ? BigInt(balance.rows[0].quantity.split('.')[0]) * 1000000n + BigInt((balance.rows[0].quantity.split('.')[1] ?? '').padEnd(6, '0') || '0') : 0n;
    const currentCost = balance.rows[0] ? BigInt(balance.rows[0].total_cost_paise) : 0n;
    const nextQty = data.direction === 'increase' ? currentQty + quantityScaled : currentQty - quantityScaled;
    const nextCost = data.direction === 'increase' ? currentCost + totalCost : currentCost - totalCost;
    if (nextQty < 0n || nextCost < 0n) throw new BadRequestException('Inventory adjustment would create negative stock or negative inventory value.');

    const sequence = await client.query<{ inventory_adjustment_next: string }>('UPDATE company_document_sequences SET inventory_adjustment_next = inventory_adjustment_next + 1 WHERE company_id = $1 RETURNING inventory_adjustment_next - 1 AS inventory_adjustment_next', [companyId]);
    if (!sequence.rows[0]) throw new BadRequestException('Company document sequence was not found.');
    const adjustmentNumber = BigInt(sequence.rows[0].inventory_adjustment_next);
    const adjustmentId = randomUUID();
    const entryId = randomUUID();
    await client.query('INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by) VALUES ($1,$2,$3,$4::date,$5,\'draft\',\'inventory_adjustment\',$6)', [entryId, companyId, `IA-${adjustmentNumber}`, data.adjustmentDate, data.reason, userId]);
    const account = config.rows[0].inventory_adjustment_account_id;
    const increase = data.direction === 'increase';
    await client.query('INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1,$2,1,$3,$4,$5,$6),($1,$2,2,$7,$8,$9,$10)', [companyId, entryId, increase ? config.rows[0].inventory_asset_account_id : account, data.reason, increase ? totalCost.toString() : '0', increase ? '0' : totalCost.toString(), increase ? account : config.rows[0].inventory_asset_account_id, data.reason, increase ? '0' : totalCost.toString(), increase ? totalCost.toString() : '0']);
    await client.query('UPDATE journal_entries SET status = \'posted\', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2', [companyId, entryId, userId]);

    if (balance.rows[0]) await client.query('UPDATE inventory_valuation_balances SET quantity = $4::numeric, total_cost_paise = $5::bigint, updated_at = now() WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3', [companyId, data.itemId, data.warehouseId, Number(nextQty) / 1000000, nextCost.toString()]);
    else await client.query('INSERT INTO inventory_valuation_balances (id, company_id, item_id, warehouse_id, quantity, total_cost_paise) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), companyId, data.itemId, data.warehouseId, Number(nextQty) / 1000000, nextCost.toString()]);
    await client.query('INSERT INTO inventory_movements (id, company_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost_paise, total_cost_paise, source_type, source_id, journal_entry_id, created_by) VALUES ($1,$2,$3,$4,$5::date,\'adjustment\',$6,$7,$8,$9,$10,$11,$12)', [randomUUID(), companyId, data.itemId, data.warehouseId, data.adjustmentDate, increase ? data.quantity : `-${data.quantity}`, data.unitCostPaise, totalCost.toString(), reversalOfId ? 'inventory_adjustment_reversal' : 'inventory_adjustment', adjustmentId, entryId, userId]);
    await client.query('INSERT INTO inventory_adjustments (id, company_id, adjustment_number, adjustment_date, item_id, warehouse_id, direction, quantity, unit_cost_paise, total_cost_paise, reason, status, journal_entry_id, reversal_of_id, created_by) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,\'posted\',$12,$13,$14)', [adjustmentId, companyId, adjustmentNumber.toString(), data.adjustmentDate, data.itemId, data.warehouseId, data.direction, data.quantity, data.unitCostPaise, totalCost.toString(), data.reason, entryId, reversalOfId, userId]);
    if (reversalOfId) await client.query('UPDATE inventory_adjustments SET status = \'reversed\', updated_at = now() WHERE company_id = $1 AND id = $2', [companyId, reversalOfId]);
    await this.audit.record(client, { actorUserId: userId, action: reversalOfId ? 'INVENTORY_ADJUSTMENT_REVERSED' : 'INVENTORY_ADJUSTMENT_POSTED', entityType: 'inventory_adjustment', entityId: adjustmentId, metadata: { companyId, adjustmentNumber: adjustmentNumber.toString(), itemId: data.itemId, warehouseId: data.warehouseId, direction: data.direction, totalCostPaise: totalCost.toString(), reversalOfId } });
    await this.audit.record(client, { actorUserId: userId, action: 'JOURNAL_ENTRY_POSTED', entityType: 'journal_entry', entityId: entryId, metadata: { companyId, sourceType: 'inventory_adjustment', adjustmentId, adjustmentNumber: adjustmentNumber.toString() } });
    return { adjustmentId, adjustmentNumber: adjustmentNumber.toString(), status: 'posted', journalEntryId: entryId, direction: data.direction, quantity: data.quantity, totalCostPaise: totalCost.toString(), reversalOfId };
  }
}
