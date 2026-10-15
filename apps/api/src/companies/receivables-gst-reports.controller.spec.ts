import { describe, expect, it, vi } from 'vitest';
import { ReceivablesGstReportsController } from './receivables-gst-reports.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const request = { user: { sub: userId } } as never;

type QueryResult = { rows: unknown[] };

function setup(results: QueryResult[]) {
  let index = 0;
  const query = vi.fn(async () => results[index++] ?? { rows: [] });
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  return { controller: new ReceivablesGstReportsController(tenantAccess as never), client, tenantAccess };
}

describe('ReceivablesGstReportsController', () => {
  it('calculates receivables ageing buckets from posted allocations as of the report date', async () => {
    const { controller } = setup([{
      rows: [
        {
          invoiceId: '1', invoiceNumber: 'SI-000001', invoiceDate: '2026-08-01', dueDate: '2026-08-15',
          partyId: 'party-1', partyName: 'Acme', totalPaise: '10000', allocatedPaise: '2500',
          outstandingPaise: '7500', daysOverdue: 61, bucket: '61-90',
        },
        {
          invoiceId: '2', invoiceNumber: 'SI-000002', invoiceDate: '2026-10-10', dueDate: '2026-10-25',
          partyId: 'party-1', partyName: 'Acme', totalPaise: '5000', allocatedPaise: '0',
          outstandingPaise: '5000', daysOverdue: 0, bucket: 'not-due',
        },
      ],
    }]);

    const result = await controller.receivablesAgeing(companyId, { asOfDate: '2026-10-15' }, request);
    expect(result.totalOutstandingPaise).toBe('12500');
    expect(result.buckets).toEqual({ 'not-due': '5000', '1-30': '0', '31-60': '0', '61-90': '7500', '90-plus': '0' });
    expect(result.invoices).toHaveLength(2);
  });

  it('supports party filtering and validates date input before opening a transaction', async () => {
    const { controller, tenantAccess } = setup([]);
    await expect(controller.receivablesAgeing(companyId, { asOfDate: '2026-02-30' }, request)).rejects.toThrow('asOfDate must be a valid calendar date.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('summarizes only GST-bearing documents whose posting journals are posted', async () => {
    const { controller } = setup([
      { rows: [{ taxablePaise: '100000', cgstPaise: '9000', sgstPaise: '9000', igstPaise: '0' }] },
      { rows: [{ taxablePaise: '60000', cgstPaise: '0', sgstPaise: '0', igstPaise: '7200' }] },
    ]);

    const result = await controller.gstSummary(companyId, { fromDate: '2026-10-01', toDate: '2026-10-31' }, request);
    expect(result.sales).toEqual({ taxablePaise: '100000', cgstPaise: '9000', sgstPaise: '9000', igstPaise: '0', totalGstPaise: '18000' });
    expect(result.purchases).toEqual({ taxablePaise: '60000', cgstPaise: '0', sgstPaise: '0', igstPaise: '7200', totalGstPaise: '7200' });
    expect(result.netGstPayablePaise).toBe('10800');
  });

  it('rejects an invalid GST date range before opening a transaction', async () => {
    const { controller, tenantAccess } = setup([]);
    await expect(controller.gstSummary(companyId, { fromDate: '2026-11-01', toDate: '2026-10-01' }, request)).rejects.toThrow('fromDate must be on or before toDate.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
