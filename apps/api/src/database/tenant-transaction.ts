import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const companyIdSchema = z.string().uuid();

/**
 * Execute work in a transaction with PostgreSQL's transaction-local tenant
 * context set. All tenant-owned queries must run through this helper (or an
 * equivalent transaction wrapper) so pooled connections cannot leak context.
 *
 * The company ID must come from the authenticated user's authorized membership,
 * never directly from an untrusted request field.
 */
export async function withTenantTransaction<T>(
  pool: Pool,
  companyId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const tenantId = companyIdSchema.parse(companyId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.current_company_id', $1, true)",
      [tenantId],
    );

    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}
