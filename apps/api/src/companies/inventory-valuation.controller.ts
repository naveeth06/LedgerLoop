import { BadRequestException, Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const accountSchema = z.object({
  inventoryAssetAccountId: z.string().uuid(),
  cogsAccountId: z.string().uuid(),
  defaultWarehouseId: z.string().uuid(),
}).strict();

@Controller('companies/:companyId/inventory')
export class InventoryValuationController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('posting-accounts')
  async getPostingAccounts(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT inventory_asset_account_id AS "inventoryAssetAccountId", cogs_account_id AS "cogsAccountId",
               default_warehouse_id AS "defaultWarehouseId"
          FROM inventory_posting_accounts WHERE company_id = $1`, [companyId]);
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
    if (data.inventoryAssetAccountId === data.cogsAccountId) throw new BadRequestException('Inventory asset and COGS accounts must be distinct.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const accounts = await client.query<{ id: string; account_type: string; is_active: boolean }>(
        'SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])',
        [companyId, [data.inventoryAssetAccountId, data.cogsAccountId]],
      );
      if (accounts.rows.length !== 2 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Every inventory posting account must be active in this company.');
      const byId = new Map(accounts.rows.map((row) => [row.id, row.account_type]));
      if (byId.get(data.inventoryAssetAccountId) !== 'asset') throw new BadRequestException('inventoryAssetAccountId must reference an active asset account.');
      if (byId.get(data.cogsAccountId) !== 'expense') throw new BadRequestException('cogsAccountId must reference an active expense account.');

      const warehouse = await client.query<{ id: string; is_active: boolean }>(
        'SELECT id, is_active FROM company_warehouses WHERE company_id = $1 AND id = $2',
        [companyId, data.defaultWarehouseId],
      );
      if (!warehouse.rows[0] || !warehouse.rows[0].is_active) throw new BadRequestException('defaultWarehouseId must reference an active warehouse in this company.');

      await client.query(`
        INSERT INTO inventory_posting_accounts (company_id, inventory_asset_account_id, cogs_account_id, default_warehouse_id, created_by)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (company_id) DO UPDATE SET inventory_asset_account_id = EXCLUDED.inventory_asset_account_id,
          cogs_account_id = EXCLUDED.cogs_account_id, default_warehouse_id = EXCLUDED.default_warehouse_id, updated_at = now()`,
        [companyId, data.inventoryAssetAccountId, data.cogsAccountId, data.defaultWarehouseId, userId],
      );
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'INVENTORY_POSTING_ACCOUNTS_CONFIGURED',
        entityType: 'inventory_posting_accounts',
        entityId: companyId,
        metadata: { companyId, defaultWarehouseId: data.defaultWarehouseId },
      });
      return { postingAccounts: data };
    });
  }

  @Get('valuation')
  async valuation(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT b.item_id AS "itemId", i.item_code AS "itemCode", i.name AS "itemName",
               b.warehouse_id AS "warehouseId", w.warehouse_code AS "warehouseCode", w.name AS "warehouseName",
               b.quantity::text AS quantity, b.total_cost_paise::text AS "totalCostPaise",
               CASE WHEN b.quantity = 0 THEN '0' ELSE round((b.total_cost_paise / b.quantity), 6)::text END AS "averageCostPaise"
          FROM inventory_valuation_balances b
          JOIN company_items i ON i.company_id = b.company_id AND i.id = b.item_id
          JOIN company_warehouses w ON w.company_id = b.company_id AND w.id = b.warehouse_id
         WHERE b.company_id = $1
         ORDER BY i.item_code, w.warehouse_code`, [companyId]);
      const totalCostPaise = result.rows.reduce((sum: bigint, row: { totalCostPaise: string }) => sum + BigInt(row.totalCostPaise), 0n).toString();
      return { balances: result.rows, totalCostPaise };
    });
  }
}
