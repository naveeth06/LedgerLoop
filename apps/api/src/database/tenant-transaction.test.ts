import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { withTenantTransaction } from './tenant-transaction';

function createPoolMock() {
  const query = vi.fn(async () => ({ rows: [] }));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  return {
    pool: { connect } as unknown as Pool,
    connect,
    client,
    query,
    release,
  };
}

const companyId = 'c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11';

describe('withTenantTransaction', () => {
  it('sets tenant context inside a transaction and commits successful work', async () => {
    const mock = createPoolMock();
    const result = await withTenantTransaction(mock.pool, companyId, async () => 'done');

    expect(result).toBe('done');
    expect(mock.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mock.query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('app.current_company_id', $1, true)",
      [companyId],
    );
    expect(mock.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the client when work fails', async () => {
    const mock = createPoolMock();
    const failure = new Error('test failure');

    await expect(
      withTenantTransaction(mock.pool, companyId, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(mock.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('rejects an invalid company ID before acquiring a connection', async () => {
    const mock = createPoolMock();

    await expect(
      withTenantTransaction(mock.pool, 'not-a-uuid', async () => 'unreachable'),
    ).rejects.toThrow();

    expect(mock.connect).not.toHaveBeenCalled();
  });
});
