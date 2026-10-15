import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

const QUANTITY_SCALE = 1_000_000n;

type InventoryLine = {
  id: string;
  item_id: string;
  warehouse_id: string | null;
  quantity: string;
  taxable_paise: string;
};

type CostIssue = {
  lineId: string;
  itemId: string;
  warehouseId: string;
  quantity: string;
  totalCostPaise: string;
  unitCostPaise: string;
};

function quantityToScaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  const normalized = fraction.padEnd(6, '0');
  if (normalized.length > 6) throw new BadRequestException('Inventory quantity supports at most 6 decimal places.');
  return BigInt(whole) * QUANTITY_SCALE + BigInt(normalized || '0');
}

function scaledToQuantity(value: bigint): string {
  const whole = value / QUANTITY_SCALE;
  const fraction = (value % QUANTITY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive.');
  return (numerator + denominator / 2n) / denominator;
}

function unitCostToSixDecimals(totalCostPaise: bigint, quantityScaled: bigint): string {
  if (quantityScaled <= 0n) return '0';
  const scaled = roundHalfUp(totalCostPaise * QUANTITY_SCALE, quantityScaled);
  const whole = scaled / QUANTITY_SCALE;
  const fraction = (scaled % QUANTITY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export class InventoryValuationService {
  async receivePurchaseLines(client: PoolClient, companyId: string, lines: InventoryLine[], journalEntryId: string, userId: string) {
    const movements: Array<{ itemId: string; warehouseId: string; quantity: string; totalCostPaise: string }> = [];

    for (const line of lines) {
      const item = await client.query<{ item_type: string; track_inventory: boolean; is_active: boolean }>(
        'SELECT item_type, track_inventory, is_active FROM company_items WHERE company_id = $1 AND id = $2 FOR SHARE',
        [companyId, line.item_id],
      );
      const itemRow = item.rows[0];
      if (!itemRow || !itemRow.is_active) throw new BadRequestException('Purchase bill contains an inactive or missing item.');
      if (itemRow.item_type !== 'goods' || !itemRow.track_inventory) continue;
      if (!line.warehouse_id) throw new BadRequestException(`Warehouse is required for tracked purchase item ${line.item_id}.`);

      const warehouse = await client.query<{ id: string; is_active: boolean }>(
        'SELECT id, is_active FROM company_warehouses WHERE company_id = $1 AND id = $2 FOR SHARE',
        [companyId, line.warehouse_id],
      );
      if (!warehouse.rows[0] || !warehouse.rows[0].is_active) throw new BadRequestException('Purchase inventory warehouse is not active.');

      const quantityScaled = quantityToScaled(line.quantity);
      const cost = BigInt(line.taxable_paise);
      if (quantityScaled <= 0n || cost < 0n) throw new BadRequestException('Purchase inventory quantity and cost are invalid.');

      const existing = await client.query<{ id: string; quantity: string; total_cost_paise: string }>(
        `SELECT id, quantity::text, total_cost_paise::text
           FROM inventory_valuation_balances
          WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3
          FOR UPDATE`,
        [companyId, line.item_id, line.warehouse_id],
      );
      if (existing.rows[0]) {
        const currentQty = quantityToScaled(existing.rows[0].quantity);
        const currentCost = BigInt(existing.rows[0].total_cost_paise);
        await client.query(
          `UPDATE inventory_valuation_balances
              SET quantity = $4::numeric, total_cost_paise = $5::bigint, updated_at = now()
            WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3`,
          [companyId, line.item_id, line.warehouse_id, scaledToQuantity(currentQty + quantityScaled), (currentCost + cost).toString()],
        );
      } else {
        await client.query(
          `INSERT INTO inventory_valuation_balances (id, company_id, item_id, warehouse_id, quantity, total_cost_paise)
           VALUES ($1,$2,$3,$4,$5::numeric,$6::bigint)`,
          [randomUUID(), companyId, line.item_id, line.warehouse_id, line.quantity, cost.toString()],
        );
      }

      const movementId = randomUUID();
      await client.query(
        `INSERT INTO inventory_movements
          (id, company_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost_paise,
           total_cost_paise, source_type, source_id, journal_entry_id, created_by)
         SELECT $1,$2,$3,$4,$5::date,'purchase',$6::numeric,$7::numeric,$8::bigint,'purchase_bill',$9,$10,$11`,
        [movementId, companyId, line.item_id, line.warehouse_id, new Date().toISOString().slice(0, 10), line.quantity,
          unitCostToSixDecimals(cost, quantityScaled), cost.toString(), line.id, journalEntryId, userId],
      );
      movements.push({ itemId: line.item_id, warehouseId: line.warehouse_id, quantity: line.quantity, totalCostPaise: cost.toString() });
    }

    return { movements };
  }

  async issueSaleLines(client: PoolClient, companyId: string, lines: InventoryLine[], journalEntryId: string, userId: string, movementDate: string) {
    const issues: CostIssue[] = [];

    for (const line of lines) {
      const item = await client.query<{ item_type: string; track_inventory: boolean; is_active: boolean }>(
        'SELECT item_type, track_inventory, is_active FROM company_items WHERE company_id = $1 AND id = $2 FOR SHARE',
        [companyId, line.item_id],
      );
      const itemRow = item.rows[0];
      if (!itemRow || !itemRow.is_active) throw new BadRequestException('Sales invoice contains an inactive or missing item.');
      if (itemRow.item_type !== 'goods' || !itemRow.track_inventory) continue;
      if (!line.warehouse_id) throw new BadRequestException(`Warehouse is required for tracked sales item ${line.item_id}.`);

      const quantityScaled = quantityToScaled(line.quantity);
      const balanceResult = await client.query<{ id: string; quantity: string; total_cost_paise: string }>(
        `SELECT id, quantity::text, total_cost_paise::text
           FROM inventory_valuation_balances
          WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3
          FOR UPDATE`,
        [companyId, line.item_id, line.warehouse_id],
      );
      const balance = balanceResult.rows[0];
      if (!balance) throw new BadRequestException(`No inventory valuation exists for item ${line.item_id} in the selected warehouse.`);

      const availableQty = quantityToScaled(balance.quantity);
      const availableCost = BigInt(balance.total_cost_paise);
      if (quantityScaled > availableQty) throw new BadRequestException(`Insufficient inventory for item ${line.item_id}.`);

      const issueCost = availableQty === quantityScaled
        ? availableCost
        : roundHalfUp(availableCost * quantityScaled, availableQty);
      const remainingQty = availableQty - quantityScaled;
      const remainingCost = availableCost - issueCost;

      await client.query(
        `UPDATE inventory_valuation_balances
            SET quantity = $4::numeric, total_cost_paise = $5::bigint, updated_at = now()
          WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3`,
        [companyId, line.item_id, line.warehouse_id, scaledToQuantity(remainingQty), remainingCost.toString()],
      );

      const movementId = randomUUID();
      await client.query(
        `INSERT INTO inventory_movements
          (id, company_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost_paise,
           total_cost_paise, source_type, source_id, journal_entry_id, created_by)
         VALUES ($1,$2,$3,$4,$5::date,'sale',$6::numeric,$7::numeric,$8::bigint,'invoice',$9,$10,$11)`,
        [movementId, companyId, line.item_id, line.warehouse_id, movementDate, `-${line.quantity}`,
          unitCostToSixDecimals(issueCost, quantityScaled), issueCost.toString(), line.id, journalEntryId, userId],
      );
      issues.push({ lineId: line.id, itemId: line.item_id, warehouseId: line.warehouse_id, quantity: line.quantity, totalCostPaise: issueCost.toString(), unitCostPaise: unitCostToSixDecimals(issueCost, quantityScaled) });
    }

    return { issues, totalCogsPaise: issues.reduce((sum, issue) => sum + BigInt(issue.totalCostPaise), 0n).toString() };
  }
}
