import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

integrationDescribe('PostgreSQL tenant row-level security', () => {
  const companyA = 'a1111111-1111-4111-8111-111111111111';
  const companyB = 'b2222222-2222-4222-8222-222222222222';

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM companies WHERE id = ANY($1::uuid[])', [[companyA, companyB]]);
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
});
