import { describe, expect, it, vi } from 'vitest';
import { AccountsController } from './accounts.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function makeController(work: (callback: (...args: any[]) => Promise<unknown>) => Promise<unknown>) {
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_userId: string, _companyId: string, callback: (...args: any[]) => Promise<unknown>) =>
      work(callback)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new AccountsController(tenantAccess as never, audit as never), tenantAccess, audit };
}

describe('AccountsController', () => {
  it('lists accounts inside an authorized company transaction', async () => {
    const account = {
      id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2',
      company_id: companyId,
      account_code: '1000',
      name: 'Cash',
      account_type: 'asset',
      parent_account_id: null,
      description: null,
      is_system: false,
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00Z'),
    };
    const { controller, tenantAccess } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [account] })),
    }));
    const result = await controller.listAccounts(companyId, { user: { sub: userId } } as never);
    expect(result.accounts).toEqual([account]);
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
  });

  it('rejects invalid account input before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(async () => {
      throw new Error('should not be called');
    });
    await expect(controller.createAccount(companyId, { accountCode: ' ', name: '', accountType: 'cash' }, { user: { sub: userId } } as never))
      .rejects.toThrow('Account details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('rejects a parent account outside the authorized company', async () => {
    const { controller, audit } = makeController(async (callback) => callback({
      query: vi.fn(async (sql: string) => sql.includes('SELECT id FROM ledger_accounts')
        ? { rows: [] }
        : { rows: [] }),
    }));
    await expect(controller.createAccount(companyId, {
      accountCode: '1000',
      name: 'Cash',
      accountType: 'asset',
      parentAccountId: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2',
    }, { user: { sub: userId } } as never)).rejects.toThrow('Parent account must belong to this company.');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records the account creation audit event in the same transaction', async () => {
    const account = {
      id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2',
      company_id: companyId,
      account_code: '1000',
      name: 'Cash',
      account_type: 'asset',
      parent_account_id: null,
      description: null,
      is_system: false,
      is_active: true,
      created_at: new Date('2026-01-01T00:00:00Z'),
    };
    const { controller, audit } = makeController(async (callback) => callback({
      query: vi.fn(async (sql: string) => sql.includes('INSERT INTO ledger_accounts')
        ? { rows: [account] }
        : { rows: [] }),
    }));
    const result = await controller.createAccount(companyId, {
      accountCode: '1000',
      name: 'Cash',
      accountType: 'asset',
    }, { user: { sub: userId } } as never);
    expect(result.account).toEqual(account);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: userId,
      action: 'LEDGER_ACCOUNT_CREATED',
      entityType: 'ledger_account',
      entityId: account.id,
      metadata: { companyId, accountCode: '1000', accountType: 'asset' },
    });
  });
});
