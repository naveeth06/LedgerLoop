import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('derives company scope from transaction context and parameterizes event data', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query } as unknown as PoolClient;
    const service = new AuditService();
    const event = {
      actorUserId: 'c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11',
      action: 'company.updated',
      entityType: 'company',
      entityId: 'a1111111-1111-4111-8111-111111111111',
      requestId: 'req-123',
      metadata: { changedFields: ['display_name'] },
    };

    await service.record(client, event);

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0];
    expect(String(sql)).toContain("current_setting('app.current_company_id', true)");
    expect(String(sql)).toContain('INSERT INTO audit_log');
    expect(values).toEqual([
      event.actorUserId,
      event.action,
      event.entityType,
      event.entityId,
      event.requestId,
      JSON.stringify(event.metadata),
    ]);
    expect(values).not.toContain('company_id');
  });

  it('rejects invalid audit events before issuing SQL', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const service = new AuditService();
    await expect(service.record({ query } as unknown as PoolClient, {
      action: '',
      entityType: 'company',
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
