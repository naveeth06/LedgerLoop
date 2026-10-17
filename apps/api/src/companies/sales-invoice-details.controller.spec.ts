import { describe, expect, it, vi } from 'vitest';
import { SalesInvoiceDetailsController } from './sales-invoice-details.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const invoiceId = 'c20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function makeController(work: (callback: (...args: any[]) => Promise<unknown>) => Promise<unknown>) {
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_userId: string, _companyId: string, callback: (...args: any[]) => Promise<unknown>) =>
      work(callback)),
  };
  return { controller: new SalesInvoiceDetailsController(tenantAccess as never), tenantAccess };
}

describe('SalesInvoiceDetailsController', () => {
  it('loads invoice, lines, and posting journal inside the authorized company transaction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: invoiceId, invoiceNumber: 'INV-2026-000001', partyName: 'Acme', status: 'issued' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'line-1', lineNumber: 1, itemName: 'Consulting', totalPaise: '2500000' }] })
      .mockResolvedValueOnce({ rows: [{ journalEntryId: 'journal-1', journalEntryNumber: 'SI-INV-2026-000001', journalStatus: 'posted' }] });
    const { controller, tenantAccess } = makeController(async (callback) => callback({ query }));

    const result = await controller.getInvoice(companyId, invoiceId, { user: { sub: userId } } as never);

    expect(result.invoice.invoiceNumber).toBe('INV-2026-000001');
    expect(result.lines).toHaveLength(1);
    expect(result.journalEntry?.journalEntryNumber).toBe('SI-INV-2026-000001');
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects an invoice that is not visible in the authorized company', async () => {
    const { controller, tenantAccess } = makeController(async (callback) => callback({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }));

    await expect(controller.getInvoice(companyId, invoiceId, { user: { sub: userId } } as never))
      .rejects.toThrow('Sales invoice was not found in this company.');
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated requests before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(async () => {
      throw new Error('should not be called');
    });

    await expect(controller.getInvoice(companyId, invoiceId, { user: undefined } as never))
      .rejects.toThrow('Authenticated user is required.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
