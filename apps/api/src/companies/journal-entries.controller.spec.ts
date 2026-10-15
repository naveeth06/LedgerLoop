import { describe, expect, it, vi } from 'vitest';
import { JournalEntriesController } from './journal-entries.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const accountA = 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const accountB = 'b20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';

function setup() {
  let generatedEntryId: string | undefined;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('INSERT INTO journal_entries')) {
      generatedEntryId = String(values?.[0]);
      return { rows: [{ id: generatedEntryId, company_id: companyId, entry_number: 'JV-001', status: 'draft' }] };
    }
    if (sql.includes('UPDATE journal_entries')) {
      return { rows: [{ id: generatedEntryId, company_id: companyId, entry_number: 'JV-001', status: 'posted' }] };
    }
    return { rows: [] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new JournalEntriesController(tenantAccess as never, audit as never), client, tenantAccess, audit };
}
const request = { user: { sub: userId } } as never;
const balancedBody = { entryNumber: 'JV-001', entryDate: '2026-10-15', post: true, lines: [
  { accountId: accountA, debitPaise: '10000', creditPaise: '0' },
  { accountId: accountB, debitPaise: '0', creditPaise: '10000' },
] };

describe('JournalEntriesController', () => {
  it('creates and posts balanced lines in the tenant transaction', async () => {
    const { controller, client, audit } = setup();
    const result = await controller.create(companyId, balancedBody, request);
    expect(result.entry.status).toBe('posted');
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(audit.record).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'JOURNAL_ENTRY_POSTED',
      entityId: result.entry.id,
    }));
  });
  it('rejects unbalanced entries before opening a transaction when posting', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.create(companyId, { ...balancedBody, lines: [
      { accountId: accountA, debitPaise: '10000', creditPaise: '0' },
      { accountId: accountB, debitPaise: '0', creditPaise: '9999' },
    ] }, request)).rejects.toThrow('Journal entry details are invalid or unbalanced.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
  it('rejects lines with both debit and credit', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.create(companyId, { ...balancedBody, lines: [
      { accountId: accountA, debitPaise: '100', creditPaise: '100' },
      { accountId: accountB, debitPaise: '0', creditPaise: '200' },
    ] }, request)).rejects.toThrow('Journal entry details are invalid or unbalanced.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
