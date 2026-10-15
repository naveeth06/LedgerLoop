import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

integrationDescribe('PostgreSQL tenant row-level security', () => {
  const companyA = 'a1111111-1111-4111-8111-111111111111';
  const companyB = 'b2222222-2222-4222-8222-222222222222';
  const userA = 'c3333333-3333-4333-8333-333333333333';
  const userB = 'd4444444-4444-4444-8444-444444444444';

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM companies WHERE id = ANY($1::uuid[])', [[companyA, companyB]]);
      await pool.query('DELETE FROM app_users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
      await pool.end();
    }
  });

  it('isolates company rows by transaction-local tenant context', async () => {
    if (!pool) throw new Error('DATABASE_URL is required for this integration test.');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');

      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyA],
      );
      await client.query(
        'INSERT INTO companies (id, legal_name, display_name) VALUES ($1, $2, $3)',
        [companyA, 'Company A Legal', 'Company A'],
      );

      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyB],
      );
      await client.query(
        'INSERT INTO companies (id, legal_name, display_name) VALUES ($1, $2, $3)',
        [companyB, 'Company B Legal', 'Company B'],
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');
      await client.query(
        "SELECT set_config('app.current_company_id', $1, true)",
        [companyA],
      );
      const visible = await client.query<{ id: string }>(
        'SELECT id FROM companies ORDER BY id',
      );
      expect(visible.rows.map((row) => row.id)).toEqual([companyA]);
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  it('lists only the authenticated user memberships across companies without exposing company rows', async () => {
    if (!pool) throw new Error('DATABASE_URL is required for this integration test.');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ledgerloop_app');
      await client.query(
        'INSERT INTO app_users (id, email, display_name) VALUES ($1, $2, $3), ($4, $5, $6)',
        [userA, 'rls-user-a@example.test', 'RLS User A', userB, 'rls-user-b@example.test', 'RLS User B'],
      );

      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyA]);
      await client.query(
        "INSERT INTO company_memberships (company_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
        [companyA, userA],
      );
      await client.query("SELECT set_config('app.current_company_id', $1, true)", [companyB]);
      await client.query(
        "INSERT INTO company_memberships (company_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active'), ($1, $3, 'viewer', 'active')",
        [companyB, userA, userB],
      );

      await client.query("SELECT set_config('app.current_company_id', '', true)");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userA]);
      const userAMemberships = await client.query<{ company_id: string }>(
        'SELECT company_id FROM company_memberships ORDER BY company_id',
      );
      expect(userAMemberships.rows.map((row) => row.company_id)).toEqual([companyA, companyB]);

      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userB]);
      const userBMemberships = await client.query<{ company_id: string }>(
        'SELECT company_id FROM company_memberships ORDER BY company_id',
      );
      expect(userBMemberships.rows.map((row) => row.company_id)).toEqual([companyB]);

      const companyRows = await client.query<{ id: string }>('SELECT id FROM companies ORDER BY id');
      expect(companyRows.rows).toEqual([]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
