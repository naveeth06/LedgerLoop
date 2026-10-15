import { describe, expect, it, vi } from 'vitest';
import { CompanySettingsController } from './company-settings.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

function makeController(work: (callback: (...args: any[]) => Promise<unknown>) => Promise<unknown>) {
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_userId: string, _companyId: string, callback: (...args: any[]) => Promise<unknown>) =>
      work(callback)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new CompanySettingsController(tenantAccess as never, audit as never), tenantAccess, audit };
}

describe('CompanySettingsController', () => {
  it('reads settings inside an authorized tenant transaction', async () => {
    const settings = { id: companyId, legal_name: 'Example Private Limited', display_name: 'Example', base_currency: 'INR', created_at: new Date() };
    const { controller, tenantAccess } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [settings] })),
    }));
    const result = await controller.getSettings(companyId, { user: { sub: userId } } as never);
    expect(result.settings).toEqual(settings);
    expect(tenantAccess.withCompanyTransaction).toHaveBeenCalledWith(userId, companyId, expect.any(Function));
  });

  it('rejects malformed GSTIN input before opening a tenant transaction', async () => {
    const { controller, tenantAccess } = makeController(async () => {
      throw new Error('should not be called');
    });
    await expect(controller.createGstRegistration(companyId, {
      gstin: 'NOT-A-GSTIN',
      legalName: 'Example',
    }, { user: { sub: userId } } as never)).rejects.toThrow('GST registration details are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });

  it('audits GST registration creation in the same transaction', async () => {
    const registration = {
      id: 'a20e6a9d-03f7-4d43-84cb-cb2d8d97b0b2',
      company_id: companyId,
      gstin: '27ABCDE1234F1Z5',
      legal_name: 'Example Private Limited',
      trade_name: null,
      state_code: '27',
      registration_type: 'regular',
      is_primary: true,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const { controller, audit } = makeController(async (callback) => callback({
      query: vi.fn(async () => ({ rows: [registration] })),
    }));
    const result = await controller.createGstRegistration(companyId, {
      gstin: registration.gstin,
      legalName: registration.legal_name,
      isPrimary: true,
    }, { user: { sub: userId } } as never);
    expect(result.registration).toEqual(registration);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: userId,
      action: 'GST_REGISTRATION_CREATED',
      entityType: 'gst_registration',
      entityId: registration.id,
      metadata: { companyId, gstin: registration.gstin, registrationType: 'regular' },
    });
  });
});
