import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { withAuthorizedTenantTransaction } from './tenant-transaction';

const userId = 'c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11';
const companyId = 'a1111111-1111-4111-8111-111111111111';
const membership = {
  id: 'd3333333-3333-4333-8333-333333333333',
  company_id: companyId,
  user_id: userId,
  role: 'owner' as const,
};

function poolWithMembership(rows: typeof membership[] = [membership]) {
  const query = vi.fn(async (sql?: string) => {
    if (sql?.includes('FROM company_memberships')) return { rows };
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  return { pool: { connect } as unknown as Pool, query, release, connect };
}

describe('withAuthorizedTenantTransaction', () => {
  it('checks active membership before executing tenant work', async () => {
    const mock = poolWithMembership();
    const work = vi.fn(async (_client: PoolClient) => 'ok');

    await expect(withAuthorizedTenantTransaction(mock.pool, userId, companyId, work))
      .resolves.toBe('ok');
    expect(mock.query.mock.calls.some(([sql]) => String(sql).includes('FROM company_memberships'))).toBe(true);
    expect(work).toHaveBeenCalledOnce();
    expect(mock.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('denies missing membership and rolls back before work runs', async () => {
    const mock = poolWithMembership([]);
    const work = vi.fn(async (_client: PoolClient) => 'should not run');

    await expect(withAuthorizedTenantTransaction(mock.pool, userId, companyId, work))
      .rejects.toThrow('Active company membership is required.');
    expect(work).not.toHaveBeenCalled();
    expect(mock.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('rejects malformed user IDs before acquiring a connection', async () => {
    const mock = poolWithMembership();
    await expect(withAuthorizedTenantTransaction(mock.pool, 'bad-id', companyId, async () => 'no'))
      .rejects.toThrow();
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
