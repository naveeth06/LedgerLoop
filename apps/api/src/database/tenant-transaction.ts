import { ForbiddenException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const companyIdSchema = z.string().uuid();
const userIdSchema = z.string().uuid();

export type CompanyMembership = {
  id: string;
  company_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer';
};

/**
 * Execute work in a transaction with PostgreSQL's transaction-local tenant
 * context set. Use withAuthorizedTenantTransaction for request-facing flows.
 * The company ID must not be treated as authorization by itself.
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
    await client.query("SELECT set_config('app.current_company_id', $1, true)", [tenantId]);
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

/** Verify an active membership and run the work in the same transaction. */
export async function withAuthorizedTenantTransaction<T>(
  pool: Pool,
  authenticatedUserId: string,
  requestedCompanyId: string,
  work: (client: PoolClient, membership: CompanyMembership) => Promise<T>,
): Promise<T> {
  const userId = userIdSchema.parse(authenticatedUserId);
  const companyId = companyIdSchema.parse(requestedCompanyId);
  return withTenantTransaction(pool, companyId, async (client) => {
    const result = await client.query<CompanyMembership>(
      `SELECT id, company_id, user_id, role FROM company_memberships
        WHERE company_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
      [companyId, userId],
    );
    const membership = result.rows[0];
    if (!membership) throw new ForbiddenException('Active company membership is required.');
    return work(client, membership);
  });
}
