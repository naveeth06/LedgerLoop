import { describe, expect, it, vi } from 'vitest';
import { PurchaseDocumentsController } from './purchase-documents.controller';
import { SalesGstService } from './sales-gst.service';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const partyId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const itemId = 'd20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM company_parties')) return { rows: [{ id: partyId, name: 'Supplier', party_type: 'supplier', gstin: '29ABCDE1234F1Z5' }] };
    if (sql.includes('FROM gst_registrations')) return { rows: [{ gstin: '33ABCDE1234F1Z5', state_code: '33', registration_type: 'regular' }] };
    if (sql.includes('FROM company_items')) return { rows: [{ id: itemId, name: 'Widget', purchase_price_paise: '10000', gst_rate_bps: 1800 }] };
    if (sql.includes('SELECT id FROM branches')) return { rows: [{ id: 'branch' }] };
    if (sql.includes('SELECT purchase_order_next')) return { rows: [{ next: '1' }] };
    if (sql.includes('SELECT purchase_bill_next')) return { rows: [{ next: '1' }] };
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const controller = new PurchaseDocumentsController(tenantAccess as never, audit as never, new SalesGstService());
  return { controller, tenantAccess, audit };
}

describe('PurchaseDocumentsController', () => {
  it('creates a numbered interstate purchase order with input GST totals', async () => {
    const { controller, audit } = setup();
    const result = await controller.createOrder(companyId, {
      documentDate: '2026-10-15',
      expectedDate: '2026-10-25',
      partyId,
      supplierStateCode: '29',
      lines: [{ itemId, quantity: '2' }],
    }, request) as { documentNumber: string; status: string; totals: { cgstPaise: string; sgstPaise: string; igstPaise: string } };

    expect(result.documentNumber).toBe('PO-2026-000001');
    expect(result.status).toBe('draft');
    expect(result.totals.cgstPaise).toBe('0');
    expect(result.totals.sgstPaise).toBe('0');
    expect(result.totals.igstPaise).toBe('3600');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PURCHASE_ORDER_CREATED' }));
  });

  it('creates a same-state purchase bill with split input GST', async () => {
    const { controller } = setup();
    const result = await controller.createBill(companyId, {
      documentDate: '2026-10-15',
      dueDate: '2026-11-14',
      supplierInvoiceNumber: 'SUP-100',
      partyId,
      supplierStateCode: '33',
      lines: [{ itemId, quantity: '1' }],
    }, request) as { documentNumber: string; totals: { cgstPaise: string; sgstPaise: string; igstPaise: string } };

    expect(result.documentNumber).toBe('BILL-2026-000001');
    expect(result.totals.cgstPaise).toBe('900');
    expect(result.totals.sgstPaise).toBe('900');
    expect(result.totals.igstPaise).toBe('0');
  });

  it('rejects invalid purchase documents before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.createBill(companyId, {
      documentDate: 'invalid',
      partyId,
      supplierStateCode: '33',
      lines: [],
    }, request)).rejects.toThrow('Purchase document details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
