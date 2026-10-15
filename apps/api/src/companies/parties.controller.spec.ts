import { describe, expect, it, vi } from 'vitest';
import { PartiesController } from './parties.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function makeController(work: (callback: (...args: any[]) => Promise<unknown>) => Promise<unknown>) {
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_userId: string, _companyId: string, callback: (...args: any[]) => Promise<unknown>) =>
      work(callback)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new PartiesController(tenantAccess as never, audit as never), tenantAccess, audit };
}

describe('PartiesController', () => {
  it('lists parties in an authorized company transaction', async () => {
    const party = { id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', party_code: 'CUST-01', name: 'Customer One' };
    const { controller, tenantAccess } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [party] })),
    }));
    const result = await controller.listParties(companyId, 'customer', 'true', { user: { sub: userId } } as never);
    expect(result.parties).toEqual([party]);
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
  });

  it('rejects invalid list filters before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(async () => {
      throw new Error('should not be called');
    });
    await expect(controller.listParties(companyId, 'employee', undefined, { user: { sub: userId } } as never))
      .rejects.toThrow('Party type filter is invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('rejects malformed party details before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(async () => {
      throw new Error('should not be called');
    });
    await expect(controller.createParty(companyId, {
      partyCode: 'C1', name: 'Invalid GSTIN', partyType: 'customer', gstin: 'bad',
    }, { user: { sub: userId } } as never)).rejects.toThrow('Party details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('writes the party and audit event in the same transaction', async () => {
    const party = {
      id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', company_id: companyId, party_code: 'CUST-01',
      name: 'Customer One', party_type: 'customer', gstin: null, email: null, phone: null,
      billing_address: {}, credit_limit_paise: '0', is_active: true, email_reminders_enabled: true,
      created_at: new Date(), updated_at: new Date(),
    };
    const { controller, audit } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [party] })),
    }));
    const result = await controller.createParty(companyId, {
      partyCode: 'cust-01', name: 'Customer One', partyType: 'customer',
    }, { user: { sub: userId } } as never);
    expect(result.party).toEqual(party);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: userId, action: 'COMPANY_PARTY_CREATED', entityType: 'company_party', entityId: party.id,
      metadata: { companyId, partyCode: 'CUST-01', partyType: 'customer' },
    });
  });

  it('updates the reminder preference and audits the change', async () => {
    const updated = { id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2', emailRemindersEnabled: false };
    const { controller, audit } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [updated], rowCount: 1 })),
    }));
    const result = await controller.updateReminderPreference(companyId, updated.id, { enabled: false }, { user: { sub: userId } } as never);
    expect(result).toEqual(updated);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: userId,
      action: 'PARTY_REMINDER_PREFERENCE_UPDATED',
      entityType: 'company_party',
      entityId: updated.id,
      metadata: { enabled: false },
    });
  });
});
