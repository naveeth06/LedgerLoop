import { describe, expect, it, vi } from 'vitest';
import { RemindersController } from './reminders.controller';

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const companyId = 'b20f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';
const request = { user: { sub: userId } } as never;

function setup(rows: unknown[] = []) {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  const client = { query };
  const tenantAccess = {
    withCompanyTransaction: vi.fn(async (_u: string, _c: string, callback: (arg: typeof client) => Promise<unknown>) => callback(client)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { controller: new RemindersController(tenantAccess as never, audit as never), client, tenantAccess, audit };
}

describe('RemindersController', () => {
  it('returns safe defaults when reminder settings are not configured', async () => {
    const { controller, client } = setup();
    const result = await controller.getSettings(companyId, request);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM company_reminder_settings'), [companyId]);
    expect(result).toEqual({ enabled: false, firstAfterDays: 1, repeatEveryDays: 7, maxReminders: 3 });
  });

  it('upserts settings and records an audit event', async () => {
    const settings = { enabled: true, firstAfterDays: 3, repeatEveryDays: 7, maxReminders: 5 };
    const { controller, audit } = setup([settings]);
    const result = await controller.updateSettings(companyId, settings, request);
    expect(result).toEqual(settings);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: userId,
      action: 'REMINDER_SETTINGS_UPDATED',
      entityType: 'company_reminder_settings',
      entityId: companyId,
      metadata: settings,
    });
  });

  it('rejects unsafe reminder settings', async () => {
    const { controller, tenantAccess } = setup();
    await expect(controller.updateSettings(companyId, {
      enabled: true,
      firstAfterDays: 0,
      repeatEveryDays: 7,
      maxReminders: 3,
    }, request)).rejects.toThrow('Reminder settings are invalid.');
    expect(tenantAccess.withCompanyTransaction).not.toHaveBeenCalled();
  });
});
