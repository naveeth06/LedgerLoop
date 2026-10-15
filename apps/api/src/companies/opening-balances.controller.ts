import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const paiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entryNumberSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._/-]+$/);

const openingBalancesSchema = z.object({
  entryNumber: entryNumberSchema,
  openingDate: dateSchema,
  memo: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    description: z.string().trim().max(500).optional(),
    debitPaise: paiseSchema,
    creditPaise: paiseSchema,
  }).strict()).min(2).max(500),
}).strict().superRefine((value, context) => {
  let debits = 0n;
  let credits = 0n;
  value.lines.forEach((line, index) => {
    const debit = BigInt(line.debitPaise);
    const credit = BigInt(line.creditPaise);
    if ((debit > 0n) === (credit > 0n)) {
      context.addIssue({ code: 'custom', path: ['lines', index], message: 'Each line must have exactly one positive debit or credit.' });
    }
    debits += debit;
    credits += credit;
  });
  if (debits === 0n || debits !== credits || debits > 999999999999999999n) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Opening balances must have equal, non-zero debit and credit totals within the supported limit.' });
  }
});

const quantitySchema = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/);
const openingInventorySchema = z.object({
  entryNumber: entryNumberSchema,
  openingDate: dateSchema,
  memo: z.string().trim().max(2000).optional(),
  inventoryAssetAccountId: z.string().uuid(),
  openingEquityAccountId: z.string().uuid(),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: quantitySchema,
    unitCostPaise: paiseSchema,
  }).strict()).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (value.inventoryAssetAccountId === value.openingEquityAccountId) {
    context.addIssue({ code: 'custom', path: ['openingEquityAccountId'], message: 'Inventory and opening equity accounts must differ.' });
  }
  value.items.forEach((item, index) => {
    if (BigInt(item.unitCostPaise) <= 0n || quantityToMicros(item.quantity) <= 0n) {
      context.addIssue({ code: 'custom', path: ['items', index], message: 'Quantity and unit cost must be positive.' });
    }
  });
});

const BIGINT_MAX = 9223372036854775807n;
const API_TOTAL_MAX = 999999999999999999n;

function quantityToMicros(quantity: string): bigint {
  const [whole, fraction = ''] = quantity.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

function inventoryValuePaise(quantity: string, unitCostPaise: string): bigint {
  // Round half up to the nearest paise; no floating-point money arithmetic.
  return (quantityToMicros(quantity) * BigInt(unitCostPaise) + 500000n) / 1000000n;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId')
export class OpeningBalancesController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Post('opening-balances')
  @CompanyRoles('owner', 'admin', 'accountant')
  async createOpeningBalances(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = openingBalancesSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Opening balance details are invalid or unbalanced.');
    const data = parsed.data;

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const accountIds = [...new Set(data.lines.map((line) => line.accountId))];
        const accounts = await client.query<{ id: string }>(
          'SELECT id FROM ledger_accounts WHERE company_id = $1 AND is_active = true AND id = ANY($2::uuid[])',
          [companyId, accountIds],
        );
        if (accounts.rows.length !== accountIds.length) {
          throw new BadRequestException('Every opening balance account must be active and belong to this company.');
        }

        const entryId = randomUUID();
        const inserted = await client.query(
          `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
           VALUES ($1, $2, $3, $4::date, $5, 'draft', 'opening_balance', $6)
           RETURNING id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at, created_at, updated_at`,
          [entryId, companyId, data.entryNumber.toUpperCase(), data.openingDate, data.memo ?? 'Opening balances', userId],
        );
        for (let index = 0; index < data.lines.length; index++) {
          const line = data.lines[index];
          await client.query(
            'INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, $4, $5, $6::bigint, $7::bigint)',
            [companyId, entryId, index + 1, line.accountId, line.description ?? null, line.debitPaise, line.creditPaise],
          );
        }
        const posted = await client.query(
          "UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2 RETURNING id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at, created_at, updated_at",
          [companyId, entryId, userId],
        );
        await this.audit.record(client, {
          actorUserId: userId, action: 'OPENING_BALANCES_POSTED', entityType: 'journal_entry', entityId: entryId,
          metadata: { companyId, entryNumber: data.entryNumber.toUpperCase(), lineCount: data.lines.length },
        });
        return { entry: { ...posted.rows[0], lines: data.lines.map((line, index) => ({ ...line, lineNumber: index + 1 })) }, insertedDraft: inserted.rows[0] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An entry with this number already exists, or these opening balances have already been recorded.');
      throw error;
    }
  }

  @Get('opening-inventory')
  async listOpeningInventory(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const inventory = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `SELECT oi.id, oi.company_id, oi.item_id AS "itemId", i.item_code AS "itemCode", i.name AS "itemName",
                oi.warehouse_id AS "warehouseId", w.warehouse_code AS "warehouseCode", w.name AS "warehouseName",
                oi.journal_entry_id AS "journalEntryId", oi.opening_date AS "openingDate",
                oi.quantity::text AS quantity, oi.unit_cost_paise::text AS "unitCostPaise",
                oi.total_value_paise::text AS "totalValuePaise", oi.created_at AS "createdAt"
           FROM opening_inventory oi
           JOIN company_items i ON i.company_id = oi.company_id AND i.id = oi.item_id
           JOIN company_warehouses w ON w.company_id = oi.company_id AND w.id = oi.warehouse_id
          WHERE oi.company_id = $1
          ORDER BY oi.opening_date, i.item_code, w.warehouse_code`,
        [companyId],
      );
      return result.rows;
    });
    return { inventory };
  }

  @Post('opening-inventory')
  @CompanyRoles('owner', 'admin', 'accountant')
  async createOpeningInventory(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = openingInventorySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Opening inventory details are invalid.');
    const data = parsed.data;
    const items = data.items.map((item) => ({ ...item, totalValuePaise: inventoryValuePaise(item.quantity, item.unitCostPaise) }));
    const totalValue = items.reduce((sum, item) => sum + item.totalValuePaise, 0n);
    if (items.some((item) => item.totalValuePaise <= 0n || item.totalValuePaise > BIGINT_MAX) ||
        totalValue <= 0n || totalValue > API_TOTAL_MAX) {
      throw new BadRequestException('Opening inventory valuation exceeds the supported paise range or rounds to zero.');
    }

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const accountResult = await client.query<{ id: string; account_type: string }>(
          'SELECT id, account_type FROM ledger_accounts WHERE company_id = $1 AND is_active = true AND id = ANY($2::uuid[])',
          [companyId, [data.inventoryAssetAccountId, data.openingEquityAccountId]],
        );
        const accountById = new Map(accountResult.rows.map((account) => [account.id, account.account_type]));
        if (accountById.get(data.inventoryAssetAccountId) !== 'asset' ||
            accountById.get(data.openingEquityAccountId) !== 'equity') {
          throw new BadRequestException('Choose an active asset account and an active equity account from this company.');
        }

        const itemIds = [...new Set(items.map((item) => item.itemId))];
        const itemResult = await client.query<{ id: string }>(
          "SELECT id FROM company_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active = true AND item_type = 'goods' AND track_inventory = true",
          [companyId, itemIds],
        );
        if (itemResult.rows.length !== itemIds.length) {
          throw new BadRequestException('Every item must be an active, inventory-tracked good in this company.');
        }
        const warehouseIds = [...new Set(items.map((item) => item.warehouseId))];
        const warehouseResult = await client.query<{ id: string }>(
          'SELECT id FROM company_warehouses WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active = true',
          [companyId, warehouseIds],
        );
        if (warehouseResult.rows.length !== warehouseIds.length) {
          throw new BadRequestException('Every warehouse must be active and belong to this company.');
        }
        const uniquePairs = new Set(items.map((item) => `${item.itemId}:${item.warehouseId}`));
        if (uniquePairs.size !== items.length) {
          throw new BadRequestException('Each item and warehouse combination may appear only once per opening inventory batch.');
        }

        const entryId = randomUUID();
        await client.query(
          `INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by)
           VALUES ($1, $2, $3, $4::date, $5, 'draft', 'opening_balance', $6)`,
          [entryId, companyId, data.entryNumber.toUpperCase(), data.openingDate, data.memo ?? 'Opening inventory', userId],
        );
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          await client.query(
            'INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, $4, $5, $6::bigint, 0)',
            [companyId, entryId, index + 1, data.inventoryAssetAccountId, `Opening inventory: ${item.itemId} at warehouse ${item.warehouseId}`, item.totalValuePaise.toString()],
          );
        }
        await client.query(
          'INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1, $2, $3, $4, $5, 0, $6::bigint)',
          [companyId, entryId, items.length + 1, data.openingEquityAccountId, 'Opening inventory offset', totalValue.toString()],
        );
        const posted = await client.query(
          "UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2 RETURNING id, company_id, entry_number, entry_date, memo, status, source_type, created_by, posted_by, posted_at, created_at, updated_at",
          [companyId, entryId, userId],
        );
        const inventoryRows = [];
        for (const item of items) {
          const row = await client.query(
            `INSERT INTO opening_inventory (company_id, item_id, warehouse_id, journal_entry_id, opening_date, quantity, unit_cost_paise, total_value_paise, created_by)
             VALUES ($1, $2, $3, $4, $5::date, $6::numeric, $7::bigint, $8::bigint, $9)
             RETURNING id, company_id, item_id AS "itemId", warehouse_id AS "warehouseId", journal_entry_id AS "journalEntryId",
                       opening_date AS "openingDate", quantity::text AS quantity, unit_cost_paise::text AS "unitCostPaise",
                       total_value_paise::text AS "totalValuePaise", created_at AS "createdAt"`,
            [companyId, item.itemId, item.warehouseId, entryId, data.openingDate, item.quantity, item.unitCostPaise, item.totalValuePaise.toString(), userId],
          );
          inventoryRows.push(row.rows[0]);
        }
        await this.audit.record(client, {
          actorUserId: userId, action: 'OPENING_INVENTORY_POSTED', entityType: 'journal_entry', entityId: entryId,
          metadata: { companyId, entryNumber: data.entryNumber.toUpperCase(), itemCount: items.length, totalValuePaise: totalValue.toString() },
        });
        return { entry: posted.rows[0], inventory: inventoryRows, totalValuePaise: totalValue.toString() };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An entry number already exists, or opening inventory was already recorded for an item and warehouse.');
      throw error;
    }
  }
}
