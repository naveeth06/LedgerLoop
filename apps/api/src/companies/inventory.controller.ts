import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TenantAccessService } from './tenant-access.service';
import { AuditService } from './audit.service';

const movementSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  movementDate: z.string().date(),
  movementType: z.enum(['opening', 'purchase', 'sale', 'adjustment', 'return_in', 'return_out']),
  quantity: z.string().regex(/^-?\d+(\.\d{1,6})?$/),
  unitCostPaise: z.string().regex(/^\d+(\.\d{1,6})?$/),
  totalCostPaise: z.string().regex(/^\d+$/),
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().uuid().optional(),
  journalEntryId: z.string().uuid().optional(),
});

@Controller('companies/:companyId/inventory')
export class InventoryController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get('movements')
  async listMovements(@Param('companyId') companyId: string, @Req() req: any) {
    return this.tenantAccess.withCompanyTransaction(req.user.sub, companyId, async (client) => {
      const result = await client.query(
        `SELECT id, item_id AS "itemId", warehouse_id AS "warehouseId", movement_date AS "movementDate",
                movement_type AS "movementType", quantity::text, unit_cost_paise::text AS "unitCostPaise",
                total_cost_paise::text AS "totalCostPaise", source_type AS "sourceType", source_id AS "sourceId",
                journal_entry_id AS "journalEntryId", created_at AS "createdAt"
           FROM inventory_movements
          WHERE company_id = $1
          ORDER BY movement_date DESC, created_at DESC`,
        [companyId],
      );
      return { movements: result.rows };
    });
  }

  @Post('movements')
  async createMovement(@Param('companyId') companyId: string, @Body() body: unknown, @Req() req: any) {
    const parsed = movementSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid inventory movement.');
    const data = parsed.data;
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) throw new BadRequestException('Quantity must be non-zero.');
    if ((quantity < 0 && !['sale', 'return_out', 'adjustment'].includes(data.movementType)) ||
        (quantity > 0 && !['opening', 'purchase', 'return_in', 'adjustment'].includes(data.movementType))) {
      throw new BadRequestException('Movement type and quantity direction do not match.');
    }

    return this.tenantAccess.withCompanyTransaction(req.user.sub, companyId, async (client) => {
      const item = await client.query('SELECT id, item_type, track_inventory, is_active FROM company_items WHERE company_id = $1 AND id = $2 FOR SHARE', [companyId, data.itemId]);
      if (!item.rows[0] || !item.rows[0].is_active) throw new BadRequestException('Item is not active.');
      if (item.rows[0].item_type !== 'goods' || !item.rows[0].track_inventory) throw new BadRequestException('Inventory can only be tracked for active inventory goods.');
      const warehouse = await client.query('SELECT id, is_active FROM company_warehouses WHERE company_id = $1 AND id = $2 FOR SHARE', [companyId, data.warehouseId]);
      if (!warehouse.rows[0] || !warehouse.rows[0].is_active) throw new BadRequestException('Warehouse is not active.');

      const id = randomUUID();
      await client.query(
        `INSERT INTO inventory_movements
          (id, company_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost_paise,
           total_cost_paise, source_type, source_id, journal_entry_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9::bigint,$10,$11,$12,$13)`,
        [id, companyId, data.itemId, data.warehouseId, data.movementDate, data.movementType, data.quantity,
         data.unitCostPaise, data.totalCostPaise, data.sourceType, data.sourceId ?? null, data.journalEntryId ?? null, req.user.sub],
      );
      await this.audit.record(client, { companyId, userId: req.user.sub, action: 'INVENTORY_MOVEMENT_CREATED', entityType: 'inventory_movement', entityId: id, metadata: { movementType: data.movementType, quantity: data.quantity, totalCostPaise: data.totalCostPaise } });
      return { id, status: 'posted' };
    });
  }
}
