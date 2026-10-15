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

const baseDocumentSchema = z.object({
  documentDate: dateSchema,
  dueDate: dateSchema.optional(),
  validUntil: dateSchema.optional(),
  partyId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  placeOfSupplyStateCode: stateCodeSchema,
  notes: z.string().trim().max(4000).optional(),
  lines: z.array(lineSchema).min(1).max(500),
}).strict();

const gstPreviewSchema = z.object({
  sellerStateCode: stateCodeSchema,
  placeOfSupplyStateCode: stateCodeSchema,
  lines: z.array(z.object({
    quantity: quantitySchema,
    unitPricePaise: paiseSchema,
    discountPaise: paiseSchema.optional(),
    gstRateBps: z.number().int().min(0).max(10000),
  }).strict()).min(1).max(500),
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

@Controller('companies/:companyId/sales')
export class SalesDocumentsController {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
    private readonly gst: SalesGstService,
  ) {}

  @Post('gst/preview')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async previewGst(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = gstPreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('GST preview details are invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async () => this.gst.calculate(
      parsed.data.lines,
      parsed.data.sellerStateCode,
      parsed.data.placeOfSupplyStateCode,
    ));
  }

  @Post('quotations')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createQuotation(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.createDocument(companyId, body, request, 'quotation');
  }

  @Post('invoices')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createInvoice(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.createDocument(companyId, body, request, 'invoice');
  }

  @Get('quotations')
  async listQuotations(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT q.id, q.quotation_number AS "quotationNumber", q.quotation_date AS "quotationDate", q.valid_until AS "validUntil",
               q.party_id AS "partyId", p.party_code AS "partyCode", p.name AS "partyName", q.status,
               q.taxable_paise::text AS "taxablePaise", q.cgst_paise::text AS "cgstPaise", q.sgst_paise::text AS "sgstPaise",
               q.igst_paise::text AS "igstPaise", q.total_paise::text AS "totalPaise", q.created_at AS "createdAt"
          FROM sales_quotations q
          JOIN company_parties p ON p.company_id = q.company_id AND p.id = q.party_id
         WHERE q.company_id = $1
         ORDER BY q.quotation_date DESC, q.quotation_number DESC`, [companyId]);
      return { quotations: result.rows };
    });
  }

  @Get('invoices')
  async listInvoices(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT i.id, i.invoice_number AS "invoiceNumber", i.invoice_date AS "invoiceDate", i.due_date AS "dueDate",
               i.party_id AS "partyId", p.party_code AS "partyCode", p.name AS "partyName", i.status,
               i.taxable_paise::text AS "taxablePaise", i.cgst_paise::text AS "cgstPaise", i.sgst_paise::text AS "sgstPaise",
               i.igst_paise::text AS "igstPaise", i.total_paise::text AS "totalPaise", i.created_at AS "createdAt"
          FROM sales_invoices i
          JOIN company_parties p ON p.company_id = i.company_id AND p.id = i.party_id
         WHERE i.company_id = $1
         ORDER BY i.invoice_date DESC, i.invoice_number DESC`, [companyId]);
      return { invoices: result.rows };
    });
  }

  private async createDocument(
    companyId: string,
    body: unknown,
    request: AuthenticatedRequest,
    type: 'quotation' | 'invoice',
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = baseDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Sales document details are invalid.');
    const data = parsed.data;

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const partyResult = await client.query<{ id: string; name: string; party_type: string; gstin: string | null }>(
          "SELECT id, name, party_type, gstin FROM company_parties WHERE company_id = $1 AND id = $2 AND is_active = true AND party_type IN ('customer', 'both')",
          [companyId, data.partyId],
        );
        if (!partyResult.rows[0]) throw new BadRequestException('Party must be an active customer in this company.');
        const party = partyResult.rows[0];

        if (data.branchId) {
          const branch = await client.query('SELECT id FROM branches WHERE company_id = $1 AND id = $2', [companyId, data.branchId]);
          if (!branch.rows[0]) throw new BadRequestException('Branch must belong to this company.');
        }

        const registration = await client.query<{ gstin: string; state_code: string; registration_type: string }>(
          "SELECT gstin, state_code, registration_type FROM gst_registrations WHERE company_id = $1 AND is_active = true AND is_primary = true LIMIT 1",
          [companyId],
        );
        if (!registration.rows[0]) throw new BadRequestException('Configure an active primary GST registration before creating a GST sales document.');
        if (registration.rows[0].registration_type === 'composition') {
          throw new BadRequestException('Composition registrations cannot use this GST sales invoice flow.');
        }

        const itemIds = [...new Set(data.lines.map((line) => line.itemId))];
        const itemResult = await client.query<{ id: string; name: string; selling_price_paise: string; gst_rate_bps: number }>(
          'SELECT id, name, selling_price_paise::text, gst_rate_bps FROM company_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active = true',
          [companyId, itemIds],
        );
        if (itemResult.rows.length !== itemIds.length) throw new BadRequestException('Every sales line item must be active and belong to this company.');
        const itemById = new Map(itemResult.rows.map((item) => [item.id, item]));

        const taxInput = data.lines.map((line) => {
          const item = itemById.get(line.itemId)!;
          return {
            quantity: line.quantity,
            unitPricePaise: line.unitPricePaise ?? item.selling_price_paise,
            discountPaise: line.discountPaise ?? '0',
            gstRateBps: line.gstRateBps ?? item.gst_rate_bps,
          };
        });
        const tax = this.gst.calculate(taxInput, registration.rows[0].state_code, data.placeOfSupplyStateCode);
        const documentId = randomUUID();
        const number = await this.nextDocumentNumber(client, companyId, type);
        const table = type === 'quotation' ? 'sales_quotations' : 'sales_invoices';
        const prefix = type === 'quotation' ? 'QT' : 'INV';
        const documentNumber = `${prefix}-${new Date(data.documentDate).getFullYear()}-${number.toString().padStart(6, '0')}`;

        if (type === 'quotation') {
          await client.query(`
            INSERT INTO ${table} (id, company_id, quotation_number, quotation_date, valid_until, party_id, branch_id, place_of_supply_state_code,
              status, subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, notes, created_by)
            VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,'draft',$9::bigint,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint,$15::bigint,$16,$17)`,
            [documentId, companyId, documentNumber, data.documentDate, data.validUntil ?? null, data.partyId, data.branchId ?? null, data.placeOfSupplyStateCode,
              tax.subtotalPaise, tax.discountPaise, tax.taxablePaise, tax.cgstPaise, tax.sgstPaise, tax.igstPaise, tax.totalPaise, data.notes ?? null, userId],
          );
          for (let index = 0; index < data.lines.length; index++) {
            const source = data.lines[index];
            const item = itemById.get(source.itemId)!;
            const calculated = tax.lines[index];
            await client.query(`
              INSERT INTO sales_quotation_lines (company_id, quotation_id, line_number, item_id, description, quantity, unit_price_paise, discount_paise,
                gst_rate_bps, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
              VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::bigint,$8::bigint,$9,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint)`,
              [companyId, documentId, index + 1, source.itemId, source.description ?? item.name, source.quantity,
                taxInput[index].unitPricePaise, taxInput[index].discountPaise, taxInput[index].gstRateBps,
                calculated.taxablePaise, calculated.cgstPaise, calculated.sgstPaise, calculated.igstPaise, calculated.totalPaise],
            );
          }
        } else {
          await client.query(`
            INSERT INTO sales_invoices (id, company_id, invoice_number, invoice_date, due_date, party_id, branch_id, seller_gstin, buyer_gstin,
              place_of_supply_state_code, status, subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, notes, created_by)
            VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,'draft',$11::bigint,$12::bigint,$13::bigint,$14::bigint,$15::bigint,$16::bigint,$17::bigint,$18,$19)`,
            [documentId, companyId, documentNumber, data.documentDate, data.dueDate ?? null, data.partyId, data.branchId ?? null,
              registration.rows[0].gstin, party.gstin, data.placeOfSupplyStateCode,
              tax.subtotalPaise, tax.discountPaise, tax.taxablePaise, tax.cgstPaise, tax.sgstPaise, tax.igstPaise, tax.totalPaise, data.notes ?? null, userId],
          );
          for (let index = 0; index < data.lines.length; index++) {
            const source = data.lines[index];
            const item = itemById.get(source.itemId)!;
            const calculated = tax.lines[index];
            await client.query(`
              INSERT INTO sales_invoice_lines (company_id, invoice_id, line_number, item_id, description, quantity, unit_price_paise, discount_paise,
                gst_rate_bps, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
              VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::bigint,$8::bigint,$9,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14::bigint)`,
              [companyId, documentId, index + 1, source.itemId, source.description ?? item.name, source.quantity,
                taxInput[index].unitPricePaise, taxInput[index].discountPaise, taxInput[index].gstRateBps,
                calculated.taxablePaise, calculated.cgstPaise, calculated.sgstPaise, calculated.igstPaise, calculated.totalPaise],
            );
          }
        }

        await this.audit.record(client, {
          actorUserId: userId,
          action: type === 'quotation' ? 'SALES_QUOTATION_CREATED' : 'SALES_INVOICE_DRAFT_CREATED',
          entityType: type === 'quotation' ? 'sales_quotation' : 'sales_invoice',
          entityId: documentId,
          metadata: { companyId, documentNumber, partyId: data.partyId, totalPaise: tax.totalPaise },
        });

        return { id: documentId, documentNumber, type, status: 'draft', totals: tax };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('The sales document number already exists. Please retry.');
      throw error;
    }
  }

  private async nextDocumentNumber(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, companyId: string, type: 'quotation' | 'invoice'): Promise<bigint> {
    await client.query(
      'INSERT INTO company_document_sequences (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING',
      [companyId],
    );
    const column = type === 'quotation' ? 'quotation_next' : 'invoice_next';
    const result = await client.query(`SELECT ${column}::text AS next FROM company_document_sequences WHERE company_id = $1 FOR UPDATE`, [companyId]);
    const next = BigInt(result.rows[0].next as string);
    await client.query(`UPDATE company_document_sequences SET ${column} = $2::bigint, updated_at = now() WHERE company_id = $1`, [companyId, (next + 1n).toString()]);
    return next;
  }
}
