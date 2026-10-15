import { describe, expect, it, vi } from 'vitest';
import { SalesDocumentsController } from './sales-documents.controller';
import { SalesGstService } from './sales-gst.service';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const partyId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const itemId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM company_parties')) return { rows: [{ id: partyId, name: 'Customer', party_type: 'customer', gstin: '33ABCDE1234F1Z5' }] };
    if (sql.includes('FROM gst_registrations')) return { rows: [{ gstin: '33ABCDE1234F1Z5', state_code: '33', registration_type: 'regular' }] };
    if (sql.includes('FROM company_items')) return { rows: [{ id: itemId, name: 'Widget', selling_price_paise: '10000', gst_rate_bps: 1800 }] };
    if (sql.includes('SELECT id FROM branches')) return { rows: [{ id: values?.[1] }] };
    if (sql.includes('INSERT INTO company_document_sequences')) return { rows: [] };
    if (sql.includes('SELECT invoice_next') || sql.includes('SELECT quotation_next')) return { rows: [{ next: '1' }] };
    if (sql.includes('UPDATE company_document_sequences')) return { rows: [] };
    if (sql.includes('INSERT INTO sales_invoices')) return { rows: [] };
    if (sql.includes('INSERT INTO sales_invoice_lines')) return { rows: [] };
    if (sql.includes('INSERT INTO sales_quotations')) return { rows: [] };
    if (sql.includes('INSERT INTO sales_quotation_lines')) return { rows: [] };
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const controller = new SalesDocumentsController(tenantAccess as never, audit as never, new SalesGstService());
  return { controller, client, tenantAccess, audit };
}

describe('SalesDocumentsController', () => {
  it('creates a numbered draft invoice with GST totals and audit metadata', async () => {
    const { controller, audit } = setup();
    const result = await controller.createInvoice(companyId, {
      documentDate: '2026-10-15',
      dueDate: '2026-11-14',
      partyId,
      placeOfSupplyStateCode: '33',
      lines: [{ itemId, quantity: '2' }],
    }, request) as { documentNumber: string; status: string; totals: { cgstPaise: string; sgstPaise: string; igstPaise: string } };

    expect(result.documentNumber).toBe('INV-2026-000001');
    expect(result.status).toBe('draft');
    expect(result.totals.cgstPaise).toBe('1800');
    expect(result.totals.sgstPaise).toBe('1800');
    expect(result.totals.igstPaise).toBe('0');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'SALES_INVOICE_DRAFT_CREATED',
    }));
  });

  it('returns interstate GST from the preview endpoint', async () => {
    const { controller } = setup();
    const result = await controller.previewGst(companyId, {
      sellerStateCode: '33',
      placeOfSupplyStateCode: '29',
      lines: [{ quantity: '1', unitPricePaise: '10000', gstRateBps: 1800 }],
    }, request) as { cgstPaise: string; sgstPaise: string; igstPaise: string };

    expect(result.cgstPaise).toBe('0');
    expect(result.sgstPaise).toBe('0');
    expect(result.igstPaise).toBe('1800');
  });

  it('rejects invalid sales documents before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.createInvoice(companyId, {
      documentDate: 'not-a-date',
      partyId,
      placeOfSupplyStateCode: '33',
      lines: [],
    }, request)).rejects.toThrow('Sales document details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
