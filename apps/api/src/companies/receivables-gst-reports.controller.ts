import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/current-user';
import { TenantAccessService } from '../database/tenant-access.service';

const ageingSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  partyId: z.string().uuid().optional(),
}).strict();

const gstSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

type AgeingRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  partyId: string;
  partyName: string;
  totalPaise: string;
  allocatedPaise: string;
  outstandingPaise: string;
  daysOverdue: number;
  bucket: 'not-due' | '1-30' | '31-60' | '61-90' | '90-plus';
};

type GstRow = {
  taxablePaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
};

@Controller('companies/:companyId/reports')
export class ReceivablesGstReportsController {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  @Get('receivables-ageing')
  async receivablesAgeing(
    @Param('companyId') companyId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = ageingSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Receivables ageing parameters are invalid.');
    const asOfDate = parsed.data.asOfDate ?? new Date().toISOString().slice(0, 10);
    validateDate(asOfDate, 'asOfDate');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<AgeingRow>(`
        WITH posted_allocations AS (
          SELECT a.invoice_id, SUM(a.allocated_paise)::text AS allocated_paise
            FROM sales_receipt_allocations a
            JOIN sales_receipts r
              ON r.company_id = a.company_id AND r.id = a.receipt_id
           WHERE a.company_id = $1
             AND r.status = 'posted'
             AND r.receipt_date <= $2::date
           GROUP BY a.invoice_id
        )
        SELECT i.id AS "invoiceId",
               i.invoice_number AS "invoiceNumber",
               i.invoice_date::text AS "invoiceDate",
               COALESCE(i.due_date, i.invoice_date)::text AS "dueDate",
               i.party_id AS "partyId",
               p.name AS "partyName",
               i.total_paise::text AS "totalPaise",
               COALESCE(pa.allocated_paise, '0') AS "allocatedPaise",
               (i.total_paise - COALESCE(pa.allocated_paise::bigint, 0))::text AS "outstandingPaise",
               GREATEST(($2::date - COALESCE(i.due_date, i.invoice_date)), 0) AS "daysOverdue",
               CASE
                 WHEN COALESCE(i.due_date, i.invoice_date) >= $2::date THEN 'not-due'
                 WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 1 AND 30 THEN '1-30'
                 WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 31 AND 60 THEN '31-60'
                 WHEN ($2::date - COALESCE(i.due_date, i.invoice_date)) BETWEEN 61 AND 90 THEN '61-90'
                 ELSE '90-plus'
               END AS "bucket"
          FROM sales_invoices i
          JOIN company_parties p ON p.company_id = i.company_id AND p.id = i.party_id
          LEFT JOIN posted_allocations pa ON pa.invoice_id = i.id
         WHERE i.company_id = $1
           AND i.status = 'issued'
           AND i.invoice_date <= $2::date
           AND ($3::uuid IS NULL OR i.party_id = $3::uuid)
           AND i.total_paise > COALESCE(pa.allocated_paise::bigint, 0)
         ORDER BY i.party_id, COALESCE(i.due_date, i.invoice_date), i.invoice_number`,
        [companyId, asOfDate, parsed.data.partyId ?? null],
      );

      const buckets = {
        'not-due': 0n,
        '1-30': 0n,
        '31-60': 0n,
        '61-90': 0n,
        '90-plus': 0n,
      } satisfies Record<AgeingRow['bucket'], bigint>;
      let totalOutstanding = 0n;
      for (const row of result.rows) {
        const amount = BigInt(row.outstandingPaise);
        totalOutstanding += amount;
        buckets[row.bucket] += amount;
      }

      return {
        report: 'receivables-ageing',
        companyId,
        asOfDate,
        partyId: parsed.data.partyId ?? null,
        totalOutstandingPaise: totalOutstanding.toString(),
        buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.toString()])),
        invoices: result.rows,
      };
    });
  }

  @Get('gst-summary')
  async gstSummary(
    @Param('companyId') companyId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = gstSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('GST summary parameters are invalid.');
    const now = new Date();
    const fromDate = parsed.data.fromDate ?? `${now.getUTCFullYear()}-01-01`;
    const toDate = parsed.data.toDate ?? now.toISOString().slice(0, 10);
    validateDate(fromDate, 'fromDate');
    validateDate(toDate, 'toDate');
    if (fromDate > toDate) throw new BadRequestException('fromDate must be on or before toDate.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const sales = await client.query<GstRow>(`
        SELECT COALESCE(SUM(i.taxable_paise), 0)::text AS "taxablePaise",
               COALESCE(SUM(i.cgst_paise), 0)::text AS "cgstPaise",
               COALESCE(SUM(i.sgst_paise), 0)::text AS "sgstPaise",
               COALESCE(SUM(i.igst_paise), 0)::text AS "igstPaise"
          FROM sales_invoices i
          JOIN journal_entries je
            ON je.company_id = i.company_id
           AND je.entry_number = 'SI-' || i.invoice_number
           AND je.source_type = 'invoice'
           AND je.status = 'posted'
         WHERE i.company_id = $1
           AND i.status = 'issued'
           AND i.invoice_date BETWEEN $2::date AND $3::date`,
        [companyId, fromDate, toDate],
      );
      const purchases = await client.query<GstRow>(`
        SELECT COALESCE(SUM(b.taxable_paise), 0)::text AS "taxablePaise",
               COALESCE(SUM(b.cgst_paise), 0)::text AS "cgstPaise",
               COALESCE(SUM(b.sgst_paise), 0)::text AS "sgstPaise",
               COALESCE(SUM(b.igst_paise), 0)::text AS "igstPaise"
          FROM purchase_bills b
          JOIN journal_entries je
            ON je.company_id = b.company_id
           AND je.entry_number = 'PB-' || b.bill_number
           AND je.source_type = 'purchase_bill'
           AND je.status = 'posted'
         WHERE b.company_id = $1
           AND b.status = 'received'
           AND b.bill_date BETWEEN $2::date AND $3::date`,
        [companyId, fromDate, toDate],
      );

      const output = sales.rows[0];
      const input = purchases.rows[0];
      const outputGst = BigInt(output.cgstPaise) + BigInt(output.sgstPaise) + BigInt(output.igstPaise);
      const inputGst = BigInt(input.cgstPaise) + BigInt(input.sgstPaise) + BigInt(input.igstPaise);
      return {
        report: 'gst-summary',
        companyId,
        fromDate,
        toDate,
        sales: { ...output, totalGstPaise: outputGst.toString() },
        purchases: { ...input, totalGstPaise: inputGst.toString() },
        netGstPayablePaise: (outputGst - inputGst).toString(),
      };
    });
  }
}

function validateDate(value: string, field: string): void {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} must be a valid calendar date.`);
  }
}
