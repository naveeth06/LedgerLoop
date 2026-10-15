import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';
import { SalesGstService } from './sales-gst.service';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stateCodeSchema = z.string().regex(/^\d{2}$/);
const quantitySchema = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/);
const paiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const lineSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().trim().min(1).max(500).optional(),
  quantity: quantitySchema,
  unitPricePaise: paiseSchema.optional(),
  discountPaise: paiseSchema.optional(),
  gstRateBps: z.number().int().min(0).max(10000).optional(),
}).strict();
const baseSchema = z.object({
  documentDate: dateSchema,
  dueDate: dateSchema.optional(),
  expectedDate: dateSchema.optional(),
  supplierInvoiceNumber: z.string().trim().max(80).optional(),
  partyId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  supplierStateCode: stateCodeSchema,
  notes: z.string().trim().max(4000).optional(),
  lines: z.array(lineSchema).min(1).max(500),
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId/purchases')
export class PurchaseDocumentsController {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
    private readonly gst: SalesGstService,
  ) {}

  @Post('orders')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createOrder(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.createDocument(companyId, body, request, 'order');
  }

  @Post('bills')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createBill(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.createDocument(companyId, body, request, 'bill');
  }

  @Get('orders')
  async listOrders(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    return this.list(companyId, request, 'order');
  }

  @Get('bills')
  async listBills(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    return this.list(companyId, request, 'bill');
  }

  private async list(companyId: string, request: AuthenticatedRequest, type: 'order' | 'bill') {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const table = type === 'order' ? 'purchase_orders' : 'purchase_bills';
      const numberColumn = type === 'order' ? 'purchase_order_number' : 'bill_number';
      const dateColumn = type === 'order' ? 'order_date' : 'bill_date';
      const result = await client.query(`
        SELECT d.id, d.${numberColumn} AS "documentNumber", d.${dateColumn} AS "documentDate",
               d.party_id AS "partyId", p.party_code AS "partyCode", p.name AS "partyName", d.status,
               d.taxable_paise::text AS "taxablePaise", d.cgst_paise::text AS "cgstPaise",
               d.sgst_paise::text AS "sgstPaise", d.igst_paise::text AS "igstPaise",
               d.total_paise::text AS "totalPaise", d.created_at AS "createdAt"
          FROM ${table} d
          JOIN company_parties p ON p.company_id = d.company_id AND p.id = d.party_id
         WHERE d.company_id = $1
         ORDER BY d.${dateColumn} DESC, d.${numberColumn} DESC`, [companyId]);
      return { [type === 'order' ? 'orders' : 'bills']: result.rows };
    });
  }

  private async createDocument(
    companyId: string,
    body: unknown,
    request: AuthenticatedRequest,
    type: 'order' | 'bill',
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = baseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Purchase document details are invalid.');
    const data = parsed.data;
    if (type === 'order' && data.dueDate) throw new BadRequestException('dueDate is only valid for purchase bills.');
    if (type === 'bill' && data.expectedDate) throw new BadRequestException('expectedDate is only valid for purchase orders.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const partyResult = await client.query<{ id: string; name: string; party_type: string; gstin: string | null }>(
          "SELECT id, name, party_type, gstin FROM company_parties WHERE company_id = $1 AND id = $2 AND is_active = true AND party_type IN ('supplier', 'both')",
          [companyId, data.partyId],
        );
        const party = partyResult.rows[0];
        if (!party) throw new BadRequestException('Party must be an active supplier in this company.');

        if (data.branchId) {
          const branch = await client.query('SELECT id FROM branches WHERE company_id = $1 AND id = $2', [companyId, data.branchId]);
          if (!branch.rows[0]) throw new BadRequestException('Branch must belong to this company.');
        }

        const registration = await client.query<{ gstin: string; state_code: string; registration_type: string }>(
          "SELECT gstin, state_code, registration_type FROM gst_registrations WHERE company_id = $1 AND is_active = true AND is_primary = true LIMIT 1",
          [companyId],
        );
        if (!registration.rows[0]) throw new BadRequestException('Configure an active primary GST registration before creating a GST purchase document.');
        if (registration.rows[0].registration_type === 'composition') {
          throw new BadRequestException('Composition registrations cannot use this GST purchase flow.');
        }

        const itemIds = [...new Set(data.lines.map((line) => line.itemId))];
        const itemResult = await client.query<{ id: string; name: string; purchase_price_paise: string; gst_rate_bps: number }>(
          'SELECT id, name, purchase_price_paise::text, gst_rate_bps FROM company_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active = true',
          [companyId, itemIds],
        );
        if (itemResult.rows.length !== itemIds.length) throw new BadRequestException('Every purchase line item must be active and belong to this company.');
        const itemById = new Map(itemResult.rows.map((item) => [item.id, item]));

        const taxInput = data.lines.map((line) => {
          const item = itemById.get(line.itemId)!;
          return {
            quantity: line.quantity,
            unitPricePaise: line.unitPricePaise ?? item.purchase_price_paise,
            discountPaise: line.discountPaise ?? '0',
            gstRateBps: line.gstRateBps ?? item.gst_rate_bps,
          };
        });
        const tax = this.gst.calculate(taxInput, data.supplierStateCode, registration.rows[0].state_code);
        const documentId = randomUUID();
        const sequenceColumn = type === 'order' ? 'purchase_order_next' : 'purchase_bill_next';
        const prefix = type === 'order' ? 'PO' : 'BILL';
        const table = type === 'order' ? 'purchase_orders' : 'purchase_bills';
        const lineTable = type === 'order' ? 'purchase_order_lines' : 'purchase_bill_lines';
        const number = await client.query<{ document_number: string }>(
          `INSERT INTO company_document_sequences (company_id) VALUES ($1)
           ON CONFLICT (company_id) DO NOTHING;
           UPDATE company_document_sequences
              SET ${sequenceColumn} = ${sequenceColumn} + 1, updated_at = now()
            WHERE company_id = $1
            RETURNING (${sequenceColumn} - 1)::text AS document_number`, [companyId],
        );
        const documentNumber = `${prefix}-${new Date(data.documentDate).getFullYear()}-${number.rows[0].document_number.padStart(6, '0')}`;

        if (type === 'order') {
          await client.query(`
            INSERT INTO purchase_orders (id, company_id, purchase_order_number, order_date, expected_date, party_id, branch_id,
              place_of_supply_state_code, status, subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise,
              total_paise, notes, created_by)
            VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,'draft',$9::bigint,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint,$15::bigint,$16,$17)`,
            [documentId, companyId, documentNumber, data.documentDate, data.expectedDate ?? null, data.partyId, data.branchId ?? null,
              registration.rows[0].state_code, tax.subtotalPaise, tax.discountPaise, tax.taxablePaise, tax.cgstPaise, tax.sgstPaise, tax.igstPaise, tax.totalPaise, data.notes ?? null, userId]);
        } else {
          await client.query(`
            INSERT INTO purchase_bills (id, company_id, bill_number, bill_date, due_date, supplier_invoice_number, party_id, branch_id,
              place_of_supply_state_code, status, subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise,
              total_paise, notes, created_by)
            VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,'draft',$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint,$15::bigint,$16::bigint,$17,$18)`,
            [documentId, companyId, documentNumber, data.documentDate, data.dueDate ?? null, data.supplierInvoiceNumber ?? null, data.partyId, data.branchId ?? null,
              registration.rows[0].state_code, tax.subtotalPaise, tax.discountPaise, tax.taxablePaise, tax.cgstPaise, tax.sgstPaise, tax.igstPaise, tax.totalPaise, data.notes ?? null, userId]);
        }

        for (let index = 0; index < data.lines.length; index++) {
          const source = data.lines[index];
          const item = itemById.get(source.itemId)!;
          const calculated = tax.lines[index];
          await client.query(`
            INSERT INTO ${lineTable} (company_id, ${type === 'order' ? 'purchase_order_id' : 'purchase_bill_id'}, line_number, item_id, description,
              quantity, unit_price_paise, discount_paise, gst_rate_bps, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
            VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::bigint,$8::bigint,$9,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint)`,
            [companyId, documentId, index + 1, source.itemId, source.description ?? item.name, source.quantity,
              taxInput[index].unitPricePaise, taxInput[index].discountPaise, taxInput[index].gstRateBps,
              calculated.taxablePaise, calculated.cgstPaise, calculated.sgstPaise, calculated.igstPaise, calculated.totalPaise]);
        }

        await this.audit.record(client, {
          actorUserId: userId,
          action: type === 'order' ? 'PURCHASE_ORDER_CREATED' : 'PURCHASE_BILL_DRAFT_CREATED',
          entityType: type === 'order' ? 'purchase_order' : 'purchase_bill',
          entityId: documentId,
          metadata: { companyId, documentNumber, partyId: data.partyId, totalPaise: tax.totalPaise },
        });

        return { id: documentId, documentNumber, type, status: 'draft', totals: tax };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('The purchase document number already exists. Please retry.');
      throw error;
    }
  }
}
