import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';

const userIdSchema = z.string().uuid();

/**
 * Run a read flow with transaction-local authenticated-user context.
 * The context is server-derived from a verified access token, never request input.
 * The RLS policy uses it only to expose the caller's own membership rows.
 */
export async function withUserTransaction<T>(
  pool: Pool,
  authenticatedUserId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const userId = userIdSchema.parse(authenticatedUserId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve original error. */ }
    throw error;
  } finally {
    client.release();
  }
}
