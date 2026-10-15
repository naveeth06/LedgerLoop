import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { AuthSessionService } from './auth-session.service';
import type { DatabaseService } from '../database/database.service';

const userId = 'c1b0c9a0-8a42-4a4b-93b6-5f7a7d0c0f11';
const session = {
  id: 'd3333333-3333-4333-8333-333333333333',
  user_id: userId,
  family_id: 'a1111111-1111-4111-8111-111111111111',
  expires_at: new Date(Date.now() + 60_000),
  revoked_at: null as Date | null,
};

function makeService(row: typeof session | undefined) {
  const clientQuery = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('SELECT id, user_id, family_id')) return { rows: row ? [row] : [] };
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query: clientQuery, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  const poolQuery = vi.fn(async () => ({ rows: [] }));
  const database = { pool: { connect, query: poolQuery } as unknown as Pool } as DatabaseService;
  return { service: new AuthSessionService(database), clientQuery, poolQuery, connect, release };
}

describe('AuthSessionService.rotate', () => {
  it('rotates a valid token within a transaction and returns a new opaque token', async () => {
    const mock = makeService(session);
    const result = await mock.service.rotate('a'.repeat(43));
    expect(result).toHaveProperty('refreshToken');
    if ('invalid' in result) throw new Error('Expected a rotated session.');
    expect(result.userId).toBe(userId);
    expect(result.refreshToken).not.toBe('a'.repeat(43));
    expect(mock.clientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mock.clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO auth_sessions'))).toBe(true);
    expect(mock.clientQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(mock.release).toHaveBeenCalledOnce();
  });

  it('does not query the database for a malformed token', async () => {
    const mock = makeService(session);
    await expect(mock.service.rotate('short')).resolves.toEqual({ invalid: true });
    expect(mock.connect).not.toHaveBeenCalled();
  });

  it('revokes the whole token family when a revoked token is replayed', async () => {
    const mock = makeService({ ...session, revoked_at: new Date() });
    await expect(mock.service.rotate('b'.repeat(43))).resolves.toEqual({ invalid: true });
    expect(mock.clientQuery.mock.calls.some(([sql]) => String(sql).includes('WHERE family_id = $1'))).toBe(true);
    expect(mock.clientQuery).toHaveBeenLastCalledWith('COMMIT');
  });
});
