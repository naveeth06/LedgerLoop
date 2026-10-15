import { describe, expect, it, vi } from 'vitest';
import { JournalReversalsController } from './journal-reversals.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const entryId = 'c20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2';
const request = { user: { sub: userId } } as never;

function setup(status = 'posted', reversalOfId: string | null = null) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM journal_entries') && sql.includes('FOR UPDATE')) {
      return { rows: [{ id: entryId, entry_number: 'JE-001', entry_date: '2026-10-15', memo: 'Original', status, source_type: 'manual', reversal_of_id: reversalOfId }] };
    }
    if (sql.includes('SELECT id FROM journal_entries')) return { rows: [] };
    if (sql.includes('FROM journal_lines')) {
      return { rows: [
        { line_number: 1, account_id: '11111111-1111-4111-8111-111111111111', description: 'Debit', debit_paise: '1000', credit_paise: '0' },
        { line_number: 2, account_id: '22222222-2222-4222-8222-222222222222', description: 'Credit', debit_paise: '0', credit_paise: '1000' },
      ] };
    }
    return { rows: [{ id: 'new-entry', entry_number: 'REV-2026-ABC12345', status: 'posted' }] };
  });
  const client = { query };
  const tenantAccess = { withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new JournalReversalsController(tenantAccess as never, audit as never), query, audit };
}

describe('JournalReversalsController', () => {
  it('creates one balanced reversal with debits and credits swapped', async () => {
    const { controller, query, audit } = setup();
    const result = await controller.reverse(companyId, entryId, request);
    expect(result.reversalEntry.status).toBe('posted');
    expect(result.originalEntryId).toBe(entryId);
    expect(result.reversalEntry.id).toBeTypeOf('string');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("source_type, created_by, posted_by, posted_at, reversal_of_id"))).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'JOURNAL_ENTRY_REVERSED' }));
  });

  it('rejects a draft journal', async () => {
    const { controller } = setup('draft');
    await expect(controller.reverse(companyId, entryId, request)).rejects.toThrow('Only posted journal entries can be reversed.');
  });

  it('rejects reversing a reversal', async () => {
    const { controller } = setup('posted', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await expect(controller.reverse(companyId, entryId, request)).rejects.toThrow('A reversal journal cannot itself be reversed.');
  });
});
