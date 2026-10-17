import { BadRequestException, Controller, Get, Param, Req } from '@nestjs/common';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { TenantAccessService } from '../database/tenant-access.service';

@Controller('companies/:companyId/sales')
export class SalesInvoiceDetailsController {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  @Get('invoices/:invoiceId')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async getInvoice(
    @Param('companyId') companyId: string,
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const invoiceResult = await client.query(`
        SELECT
          i.id,
          i.invoice_number AS "invoiceNumber",
          i.invoice_date AS "invoiceDate",
          i.due_date AS "dueDate",
          i.party_id AS "partyId",
          p.party_code AS "partyCode",
          p.name AS "partyName",
          p.gstin AS "partyGstin",
          i.seller_gstin AS "sellerGstin",
          i.place_of_supply_state_code AS "placeOfSupplyStateCode",
          i.status,
          i.subtotal_paise::text AS "subtotalPaise",
          i.discount_paise::text AS "discountPaise",
          i.taxable_paise::text AS "taxablePaise",
          i.cgst_paise::text AS "cgstPaise",
          i.sgst_paise::text AS "sgstPaise",
          i.igst_paise::text AS "igstPaise",
          i.total_paise::text AS "totalPaise",
          i.notes,
          i.created_at AS "createdAt",
          i.updated_at AS "updatedAt"
        FROM sales_invoices i
        JOIN company_parties p ON p.company_id = i.company_id AND p.id = i.party_id
        WHERE i.company_id = $1 AND i.id = $2
      `, [companyId, invoiceId]);

      const invoice = invoiceResult.rows[0];
      if (!invoice) throw new BadRequestException('Sales invoice was not found in this company.');

      const linesResult = await client.query(`
        SELECT
          l.id,
          l.line_number AS "lineNumber",
          l.item_id AS "itemId",
          item.item_code AS "itemCode",
          item.name AS "itemName",
          l.description,
          l.quantity::text AS quantity,
          l.unit_price_paise::text AS "unitPricePaise",
          l.discount_paise::text AS "discountPaise",
          l.gst_rate_bps AS "gstRateBps",
          l.taxable_paise::text AS "taxablePaise",
          l.cgst_paise::text AS "cgstPaise",
          l.sgst_paise::text AS "sgstPaise",
          l.igst_paise::text AS "igstPaise",
          l.total_paise::text AS "totalPaise"
        FROM sales_invoice_lines l
        JOIN company_items item ON item.company_id = l.company_id AND item.id = l.item_id
        WHERE l.company_id = $1 AND l.invoice_id = $2
        ORDER BY l.line_number
      `, [companyId, invoiceId]);

      const journalResult = await client.query(`
        SELECT
          j.id AS "journalEntryId",
          j.entry_number AS "journalEntryNumber",
          j.entry_date AS "journalEntryDate",
          j.status AS "journalStatus",
          j.posted_at AS "postedAt"
        FROM journal_entries j
        WHERE j.company_id = $1
          AND j.source_type = 'invoice'
          AND j.entry_number = 'SI-' || $2
        LIMIT 1
      `, [companyId, invoice.invoiceNumber]);

      return {
        invoice,
        lines: linesResult.rows,
        journalEntry: journalResult.rows[0] ?? null,
      };
    });
  }
}
