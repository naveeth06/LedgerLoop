import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const itemTypes = ['goods', 'service'] as const;

const itemFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  itemType: z.enum(itemTypes),
  hsnSac: z.string().trim().regex(/^[0-9]{4,8}$/).optional(),
  unitCode: z.string().trim().min(1).max(16),
  gstRateBps: z.number().int().min(0).max(10000),
  sellingPricePaise: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  purchasePricePaise: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  trackInventory: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.itemType === 'service' && value.trackInventory) {
    context.addIssue({ code: 'custom', path: ['trackInventory'], message: 'Services cannot track inventory.' });
  }
});

const createItemSchema = z.object({
  itemCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
  ...itemFieldsSchema.shape,
}).strict().superRefine((value, context) => {
  if (value.itemType === 'service' && value.trackInventory) {
    context.addIssue({ code: 'custom', path: ['trackInventory'], message: 'Services cannot track inventory.' });
  }
});

const updateItemSchema = itemFieldsSchema;

const createWarehouseSchema = z.object({
  warehouseCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(160),
  branchId: z.string().uuid().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
}).strict();

const updateWarehouseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  branchId: z.string().uuid().optional(),
  address: z.record(z.string(), z.unknown()),
}).strict();

@Controller('companies/:companyId/items')
export class ItemsController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async listItems(@Param('companyId') companyId: string, @Query('type') type: string | undefined,
    @Query('active') active: string | undefined, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    if (type !== undefined && !itemTypes.includes(type as typeof itemTypes[number])) throw new BadRequestException('Item type filter is invalid.');
    if (active !== undefined && active !== 'true' && active !== 'false') throw new BadRequestException('Active filter must be true or false.');
    const items = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `SELECT id, company_id, item_code, name, item_type, hsn_sac, unit_code, gst_rate_bps,
                selling_price_paise, purchase_price_paise, track_inventory, is_active, created_at, updated_at
           FROM company_items WHERE company_id = $1
            AND ($2::text IS NULL OR item_type = $2) AND ($3::boolean IS NULL OR is_active = $3)
          ORDER BY name ASC, item_code ASC`,
        [companyId, type ?? null, active === undefined ? null : active === 'true'],
      );
      return result.rows;
    });
    return { items };
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createItem(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Item details are invalid.');
    const data = parsed.data;
    const trackInventory = data.itemType === 'service' ? false : data.trackInventory;
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const inserted = await client.query(
          `INSERT INTO company_items
             (company_id, item_code, name, item_type, hsn_sac, unit_code, gst_rate_bps,
              selling_price_paise, purchase_price_paise, track_inventory, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::bigint, $9::bigint, $10, $11)
           RETURNING id, company_id, item_code, name, item_type, hsn_sac, unit_code, gst_rate_bps,
                     selling_price_paise, purchase_price_paise, track_inventory, is_active, created_at, updated_at`,
          [companyId, data.itemCode.toUpperCase(), data.name, data.itemType, data.hsnSac ?? null,
            data.unitCode, data.gstRateBps, data.sellingPricePaise, data.purchasePricePaise, trackInventory, userId],
        );
        const item = inserted.rows[0];
        await this.audit.record(client, {
          actorUserId: userId, action: 'COMPANY_ITEM_CREATED', entityType: 'company_item', entityId: item.id,
          metadata: { companyId, itemCode: item.item_code, itemType: item.item_type },
        });
        return { item };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An item with this code already exists in the company.');
      throw error;
    }
  }

  @Patch(':itemId')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateItem(@Param('companyId') companyId: string, @Param('itemId') itemId: string,
    @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = updateItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Item details are invalid.');
    const data = parsed.data;
    const trackInventory = data.itemType === 'service' ? false : data.trackInventory;
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(
        `UPDATE company_items
            SET name = $3, item_type = $4, hsn_sac = $5, unit_code = $6, gst_rate_bps = $7,
                selling_price_paise = $8::bigint, purchase_price_paise = $9::bigint,
                track_inventory = $10, updated_at = NOW()
          WHERE company_id = $1 AND id = $2
        RETURNING id, company_id, item_code, name, item_type, hsn_sac, unit_code, gst_rate_bps,
                  selling_price_paise, purchase_price_paise, track_inventory, is_active, created_at, updated_at`,
        [companyId, itemId, data.name, data.itemType, data.hsnSac ?? null, data.unitCode,
          data.gstRateBps, data.sellingPricePaise, data.purchasePricePaise, trackInventory],
      );
      const item = updated.rows[0];
      if (!item) throw new BadRequestException('Item was not found in this company.');
      await this.audit.record(client, {
        actorUserId: userId, action: 'COMPANY_ITEM_UPDATED', entityType: 'company_item', entityId: item.id,
        metadata: { companyId, itemCode: item.item_code, itemType: item.item_type },
      });
      return { item };
    });
  }

  @Patch(':itemId/status')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateItemStatus(@Param('companyId') companyId: string, @Param('itemId') itemId: string,
    @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Item status is invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(
        `UPDATE company_items SET is_active = $3, updated_at = NOW()
          WHERE company_id = $1 AND id = $2
        RETURNING id, company_id, item_code, name, item_type, hsn_sac, unit_code, gst_rate_bps,
                  selling_price_paise, purchase_price_paise, track_inventory, is_active, created_at, updated_at`,
        [companyId, itemId, parsed.data.isActive],
      );
      const item = updated.rows[0];
      if (!item) throw new BadRequestException('Item was not found in this company.');
      await this.audit.record(client, {
        actorUserId: userId, action: 'COMPANY_ITEM_STATUS_UPDATED', entityType: 'company_item', entityId: item.id,
        metadata: { companyId, itemCode: item.item_code, isActive: item.is_active },
      });
      return { item };
    });
  }
}

@Controller('companies/:companyId/warehouses')
export class WarehousesController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async listWarehouses(@Param('companyId') companyId: string, @Query('active') active: string | undefined,
    @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    if (active !== undefined && active !== 'true' && active !== 'false') throw new BadRequestException('Active filter must be true or false.');
    const warehouses = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `SELECT id, company_id, branch_id, warehouse_code, name, address, is_active, created_at, updated_at
           FROM company_warehouses WHERE company_id = $1 AND ($2::boolean IS NULL OR is_active = $2)
          ORDER BY name ASC, warehouse_code ASC`,
        [companyId, active === undefined ? null : active === 'true'],
      );
      return result.rows;
    });
    return { warehouses };
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createWarehouse(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createWarehouseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Warehouse details are invalid.');
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        if (parsed.data.branchId) {
          const branch = await client.query('SELECT id FROM branches WHERE company_id = $1 AND id = $2 LIMIT 1', [companyId, parsed.data.branchId]);
          if (!branch.rows[0]) throw new BadRequestException('Branch must belong to this company.');
        }
        const inserted = await client.query(
          `INSERT INTO company_warehouses (company_id, branch_id, warehouse_code, name, address, created_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           RETURNING id, company_id, branch_id, warehouse_code, name, address, is_active, created_at, updated_at`,
          [companyId, parsed.data.branchId ?? null, parsed.data.warehouseCode.toUpperCase(), parsed.data.name,
            JSON.stringify(parsed.data.address ?? {}), userId],
        );
        const warehouse = inserted.rows[0];
        await this.audit.record(client, {
          actorUserId: userId, action: 'COMPANY_WAREHOUSE_CREATED', entityType: 'company_warehouse', entityId: warehouse.id,
          metadata: { companyId, warehouseCode: warehouse.warehouse_code, branchId: warehouse.branch_id },
        });
        return { warehouse };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A warehouse with this code already exists in the company.');
      throw error;
    }
  }

  @Patch(':warehouseId')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateWarehouse(@Param('companyId') companyId: string, @Param('warehouseId') warehouseId: string,
    @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = updateWarehouseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Warehouse details are invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      if (parsed.data.branchId) {
        const branch = await client.query('SELECT id FROM branches WHERE company_id = $1 AND id = $2 LIMIT 1', [companyId, parsed.data.branchId]);
        if (!branch.rows[0]) throw new BadRequestException('Branch must belong to this company.');
      }
      const updated = await client.query(
        `UPDATE company_warehouses
            SET name = $3, branch_id = $4, address = $5::jsonb, updated_at = NOW()
          WHERE company_id = $1 AND id = $2
        RETURNING id, company_id, branch_id, warehouse_code, name, address, is_active, created_at, updated_at`,
        [companyId, warehouseId, parsed.data.name, parsed.data.branchId ?? null, JSON.stringify(parsed.data.address)],
      );
      const warehouse = updated.rows[0];
      if (!warehouse) throw new BadRequestException('Warehouse was not found in this company.');
      await this.audit.record(client, {
        actorUserId: userId, action: 'COMPANY_WAREHOUSE_UPDATED', entityType: 'company_warehouse', entityId: warehouse.id,
        metadata: { companyId, warehouseCode: warehouse.warehouse_code, branchId: warehouse.branch_id },
      });
      return { warehouse };
    });
  }

  @Patch(':warehouseId/status')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateWarehouseStatus(@Param('companyId') companyId: string, @Param('warehouseId') warehouseId: string,
    @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Warehouse status is invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(
        `UPDATE company_warehouses SET is_active = $3, updated_at = NOW()
          WHERE company_id = $1 AND id = $2
        RETURNING id, company_id, branch_id, warehouse_code, name, address, is_active, created_at, updated_at`,
        [companyId, warehouseId, parsed.data.isActive],
      );
      const warehouse = updated.rows[0];
      if (!warehouse) throw new BadRequestException('Warehouse was not found in this company.');
      await this.audit.record(client, {
        actorUserId: userId, action: 'COMPANY_WAREHOUSE_STATUS_UPDATED', entityType: 'company_warehouse', entityId: warehouse.id,
        metadata: { companyId, warehouseCode: warehouse.warehouse_code, isActive: warehouse.is_active },
      });
      return { warehouse };
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}
