import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { withUserTransaction } from './user-transaction';

function createPoolMock() {
  const query = vi.fn(async () => ({ rows: [] }));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  return { pool: { connect } as unknown as Pool, connect, query, release };
}

const userId = 'e50f8a1b-15e1-4c35-9f28-20c1b0a9c7a2';

describe('withUserTransaction', () => {
  it('sets authenticated user context and commits successful work', async () => {
    const mock = createPoolMock();
    await expect(withUserTransaction(mock.pool, userId, async () => 'ok')).resolves.toBe('ok');
    expect(mock.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mock.query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('app.current_user_id', $1, true)",
      [userId],
    );
    expect(mock.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the client when work fails', async () => {
    const mock = createPoolMock();
    const failure = new Error('test failure');
    await expect(withUserTransaction(mock.pool, userId, async () => { throw failure; })).rejects.toBe(failure);
    expect(mock.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('rejects invalid user IDs before acquiring a connection', async () => {
    const mock = createPoolMock();
    await expect(withUserTransaction(mock.pool, 'not-a-uuid', async () => 'unreachable')).rejects.toThrow();
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
