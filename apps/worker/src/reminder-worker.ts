import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL must use postgres:// or postgresql://',
  ),
  REDIS_URL: z.string().url().refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'REDIS_URL must use redis:// or rediss://',
  ),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
});

const QUEUE_NAME = 'ledgerloop-reminders';
const SCHEDULER_ID = 'overdue-reminder-scan';

export async function runOverdueReminderScan(client: PoolClient, today = new Date()): Promise<number> {
  const companyResult = await client.query<{ company_id: string }>(
    'SELECT company_id FROM ledgerloop_reminder_companies()',
  );
  let created = 0;
  const todayIso = today.toISOString().slice(0, 10);

  for (const { company_id: companyId } of companyResult.rows) {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);

    const settings = await client.query<{
      first_after_days: number;
      repeat_every_days: number;
      max_reminders: number;
    }>(
      `SELECT first_after_days, repeat_every_days, max_reminders
         FROM company_reminder_settings
        WHERE company_id = $1 AND enabled = true`,
      [companyId],
    );
    if (settings.rowCount !== 1) continue;

    const setting = settings.rows[0];
    const result = await client.query<{
      invoice_id: string;
      party_id: string;
      due_date: string;
      outstanding_paise: string;
      reminder_sequence: number;
    }>(
      `WITH allocation_totals AS (
         SELECT a.invoice_id,
                COALESCE(SUM(a.allocated_paise), 0)::bigint AS allocated_paise
           FROM sales_receipt_allocations a
           JOIN sales_receipts r
             ON r.company_id = a.company_id AND r.id = a.receipt_id
          WHERE a.company_id = $1 AND r.status = 'posted'
          GROUP BY a.invoice_id
       ), latest AS (
         SELECT invoice_id,
                MAX(reminder_sequence) AS reminder_sequence,
                MAX(created_at)::date AS last_reminder_date
           FROM overdue_reminder_events
          WHERE company_id = $1
          GROUP BY invoice_id
       )
       SELECT i.id AS invoice_id,
              i.party_id,
              COALESCE(i.due_date, i.invoice_date)::text AS due_date,
              (i.total_paise - COALESCE(at.allocated_paise, 0))::text AS outstanding_paise,
              COALESCE(latest.reminder_sequence, 0) + 1 AS reminder_sequence
         FROM sales_invoices i
         LEFT JOIN allocation_totals at ON at.invoice_id = i.id
         LEFT JOIN latest ON latest.invoice_id = i.id
        WHERE i.company_id = $1
          AND i.status = 'issued'
          AND COALESCE(i.due_date, i.invoice_date) < $2::date
          AND i.total_paise > COALESCE(at.allocated_paise, 0)
          AND COALESCE(latest.reminder_sequence, 0) < $3
          AND (
            (latest.reminder_sequence IS NULL
              AND COALESCE(i.due_date, i.invoice_date) <= ($2::date - $4::integer))
            OR
            (latest.reminder_sequence IS NOT NULL
              AND latest.last_reminder_date <= ($2::date - $5::integer))
          )
        ORDER BY COALESCE(i.due_date, i.invoice_date), i.invoice_number`,
      [companyId, todayIso, setting.max_reminders, setting.first_after_days, setting.repeat_every_days],
    );

    for (const row of result.rows) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO overdue_reminder_events
          (company_id, invoice_id, party_id, reminder_sequence, due_date, outstanding_paise)
         VALUES ($1, $2, $3, $4, $5::date, $6)
         ON CONFLICT (company_id, invoice_id, reminder_sequence) DO NOTHING
         RETURNING id`,
        [companyId, row.invoice_id, row.party_id, row.reminder_sequence, row.due_date, row.outstanding_paise],
      );
      if ((inserted.rowCount ?? 0) === 1) {
        created += 1;
        await client.query(
          `INSERT INTO audit_log
            (company_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, NULL, 'OVERDUE_REMINDER_CREATED', 'overdue_reminder_event', $2, $3::jsonb)`,
          [
            companyId,
            inserted.rows[0].id,
            JSON.stringify({ invoiceId: row.invoice_id, reminderSequence: row.reminder_sequence }),
          ],
        );
      }
    }
  }

  return created;
}

export function parseRedisUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function loadEnvironment(): z.infer<typeof environmentSchema> {
  return environmentSchema.parse(process.env);
}

export async function main(): Promise<void> {
  const environment = loadEnvironment();
  const redis = parseRedisUrl(environment.REDIS_URL);
  const pool = new Pool({ connectionString: environment.DATABASE_URL });
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: 60 * 60 * 1000 },
    { name: 'scan-overdue-reminders', data: {} },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name !== 'scan-overdue-reminders') return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await runOverdueReminderScan(client);
        await client.query('COMMIT');
        return { created };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    { connection: redis, concurrency: environment.WORKER_CONCURRENCY },
  );

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await pool.end();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (require.main === module) {
  void main();
}
