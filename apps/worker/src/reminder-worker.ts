import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import { buildSmtpConfig, SmtpEmailProvider } from './email-provider';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), 'DATABASE_URL must use postgres:// or postgresql://'),
  REDIS_URL: z.string().url().refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), 'REDIS_URL must use redis:// or rediss://'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.string().optional(), SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), REMINDER_FROM_EMAIL: z.string().optional(),
});

const QUEUE_NAME = 'ledgerloop-reminders';
const SCHEDULER_ID = 'overdue-reminder-scan';
const DELIVERY_SCHEDULER_ID = 'overdue-reminder-email-dispatch';
const MAX_EMAIL_ATTEMPTS = 10;

export async function runOverdueReminderScan(client: PoolClient, today = new Date()): Promise<number> {
  const companies = await client.query<{ company_id: string }>('SELECT company_id FROM ledgerloop_reminder_companies()');
  let created = 0;
  const todayIso = today.toISOString().slice(0, 10);
  for (const { company_id: companyId } of companies.rows) {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);
    const settings = await client.query<{ first_after_days: number; repeat_every_days: number; max_reminders: number }>(
      `SELECT first_after_days, repeat_every_days, max_reminders FROM company_reminder_settings WHERE company_id = $1 AND enabled = true`, [companyId]);
    if (settings.rowCount !== 1) continue;
    const setting = settings.rows[0];
    const invoices = await client.query<{ invoice_id: string; party_id: string; due_date: string; outstanding_paise: string; reminder_sequence: number }>(
      `WITH allocation_totals AS (
         SELECT a.invoice_id, COALESCE(SUM(a.allocated_paise), 0)::bigint AS allocated_paise
           FROM sales_receipt_allocations a JOIN sales_receipts r ON r.company_id = a.company_id AND r.id = a.receipt_id
          WHERE a.company_id = $1 AND r.status = 'posted' GROUP BY a.invoice_id
       ), latest AS (
         SELECT invoice_id, MAX(reminder_sequence) AS reminder_sequence, MAX(created_at)::date AS last_reminder_date
           FROM overdue_reminder_events WHERE company_id = $1 GROUP BY invoice_id
       )
       SELECT i.id AS invoice_id, i.party_id, COALESCE(i.due_date, i.invoice_date)::text AS due_date,
              (i.total_paise - COALESCE(at.allocated_paise, 0))::text AS outstanding_paise,
              COALESCE(latest.reminder_sequence, 0) + 1 AS reminder_sequence
         FROM sales_invoices i LEFT JOIN allocation_totals at ON at.invoice_id = i.id LEFT JOIN latest ON latest.invoice_id = i.id
        WHERE i.company_id = $1 AND i.status = 'issued' AND COALESCE(i.due_date, i.invoice_date) < $2::date
          AND i.total_paise > COALESCE(at.allocated_paise, 0) AND COALESCE(latest.reminder_sequence, 0) < $3
          AND ((latest.reminder_sequence IS NULL AND COALESCE(i.due_date, i.invoice_date) <= ($2::date - $4::integer))
            OR (latest.reminder_sequence IS NOT NULL AND latest.last_reminder_date <= ($2::date - $5::integer)))
        ORDER BY COALESCE(i.due_date, i.invoice_date), i.invoice_number`,
      [companyId, todayIso, setting.max_reminders, setting.first_after_days, setting.repeat_every_days]);

    for (const row of invoices.rows) {
      const event = await client.query<{ id: string }>(
        `INSERT INTO overdue_reminder_events (company_id, invoice_id, party_id, reminder_sequence, due_date, outstanding_paise)
         VALUES ($1, $2, $3, $4, $5::date, $6) ON CONFLICT (company_id, invoice_id, reminder_sequence) DO NOTHING RETURNING id`,
        [companyId, row.invoice_id, row.party_id, row.reminder_sequence, row.due_date, row.outstanding_paise]);
      if ((event.rowCount ?? 0) !== 1) continue;
      created += 1;
      const eventId = event.rows[0].id;
      await client.query(`INSERT INTO audit_log (company_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, NULL, 'OVERDUE_REMINDER_CREATED', 'overdue_reminder_event', $2, $3::jsonb)`,
        [companyId, eventId, JSON.stringify({ invoiceId: row.invoice_id, reminderSequence: row.reminder_sequence })]);
      await client.query(
        `INSERT INTO reminder_email_deliveries (company_id, reminder_event_id, party_id, recipient_email, subject)
         SELECT $1, $2, p.id, lower(trim(p.email)), 'Payment reminder: invoice ' || i.invoice_number
           FROM company_parties p JOIN sales_invoices i ON i.company_id = p.company_id AND i.party_id = p.id
          WHERE p.company_id = $1 AND p.id = $3 AND p.email IS NOT NULL AND p.email_reminders_enabled = true AND length(trim(p.email)) > 0
         ON CONFLICT (company_id, reminder_event_id) DO NOTHING`, [companyId, eventId, row.party_id]);
    }
  }
  return created;
}

export async function enqueuePendingReminderEmails(client: PoolClient, queue: Queue): Promise<number> {
  const companies = await client.query<{ company_id: string }>('SELECT company_id FROM ledgerloop_reminder_companies()');
  let queued = 0;
  for (const { company_id: companyId } of companies.rows) {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);
    const result = await client.query<{ id: string }>(
      `SELECT id FROM reminder_email_deliveries WHERE company_id = $1 AND status IN ('pending', 'failed') AND attempt_count < $2 AND next_attempt_at <= now() ORDER BY next_attempt_at, created_at LIMIT 500`,
      [companyId, MAX_EMAIL_ATTEMPTS]);
    for (const row of result.rows) {
      await queue.add('send-reminder-email', { deliveryId: row.id, companyId }, {
        jobId: `reminder-email:${row.id}`, attempts: MAX_EMAIL_ATTEMPTS, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 1000,
      });
      queued += 1;
    }
  }
  return queued;
}

export async function processReminderEmail(pool: Pool, companyId: string, deliveryId: string, provider: SmtpEmailProvider): Promise<void> {
  const claimed = await withTransaction(pool, async (client) => {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);
    const result = await client.query<{ company_id: string; recipient_email: string; subject: string; invoice_number: string; due_date: string; outstanding_paise: string; reminder_sequence: number }>(
      `WITH claim AS (
         SELECT d.id FROM reminder_email_deliveries d
          WHERE d.company_id = $1 AND d.id = $2 AND d.status IN ('pending', 'failed') AND d.attempt_count < $3 AND d.next_attempt_at <= now()
          FOR UPDATE SKIP LOCKED
       )
       UPDATE reminder_email_deliveries d SET status = 'processing', attempt_count = d.attempt_count + 1, last_attempt_at = now(), updated_at = now()
         FROM claim c JOIN overdue_reminder_events e ON e.company_id = d.company_id AND e.id = d.reminder_event_id
        WHERE d.id = c.id
        RETURNING d.company_id, d.recipient_email, d.subject,
          (SELECT i.invoice_number FROM sales_invoices i WHERE i.company_id = d.company_id AND i.id = e.invoice_id) AS invoice_number,
          e.due_date::text AS due_date, e.outstanding_paise::text AS outstanding_paise, e.reminder_sequence`,
      [companyId, deliveryId, MAX_EMAIL_ATTEMPTS]);
    return result.rows[0];
  });
  if (!claimed) return;

  const text = `Payment reminder for invoice ${claimed.invoice_number}.\nDue date: ${claimed.due_date}\nOutstanding amount (paise): ${claimed.outstanding_paise}\nReminder ${claimed.reminder_sequence}.`;
  const html = `<p>Payment reminder for invoice <strong>${escapeHtml(claimed.invoice_number)}</strong>.</p><p>Due date: ${escapeHtml(claimed.due_date)}<br>Outstanding amount (paise): ${escapeHtml(claimed.outstanding_paise)}<br>Reminder ${claimed.reminder_sequence}.</p>`;
  try {
    const sent = await provider.send({
      to: claimed.recipient_email,
      subject: claimed.subject,
      text,
      html,
      messageId: `<ledgerloop-reminder-${deliveryId}@ledgerloop.local>`,
    });
    await withTransaction(pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);
      await client.query(`UPDATE reminder_email_deliveries SET status = 'sent', sent_at = now(), provider_message_id = $2, last_error = NULL, updated_at = now() WHERE id = $1 AND status = 'processing'`, [deliveryId, sent.providerMessageId ?? null]);
      await client.query(`INSERT INTO audit_log (company_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, NULL, 'REMINDER_EMAIL_SENT', 'reminder_email_delivery', $2, $3::jsonb)`, [companyId, deliveryId, JSON.stringify({ providerMessageId: sent.providerMessageId ?? null })]);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown email provider error';
    await withTransaction(pool, async (client) => {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_company_id', companyId]);
      const attempt = await client.query<{ attempt_count: number }>('SELECT attempt_count FROM reminder_email_deliveries WHERE id = $1', [deliveryId]);
      const attemptCount = attempt.rows[0]?.attempt_count ?? MAX_EMAIL_ATTEMPTS;
      const exhausted = attemptCount >= MAX_EMAIL_ATTEMPTS;
      await client.query(`UPDATE reminder_email_deliveries SET status = $2, next_attempt_at = CASE WHEN $2 = 'failed' THEN now() + ($3 || ' minutes')::interval ELSE now() END, last_error = $4, updated_at = now() WHERE id = $1`,
        [deliveryId, exhausted ? 'failed' : 'pending', String(Math.min(60, 2 ** Math.min(attemptCount, 6))), message]);
      await client.query(`INSERT INTO audit_log (company_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, NULL, 'REMINDER_EMAIL_FAILED', 'reminder_email_delivery', $2, $3::jsonb)`, [companyId, deliveryId, JSON.stringify({ attemptCount, error: message, exhausted })]);
    });
    throw error;
  }
}

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
}

export function parseRedisUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') throw new Error('REDIS_URL must use redis:// or rediss://');
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, ...(url.protocol === 'rediss:' ? { tls: {} } : {}) };
}

export function loadEnvironment(): z.infer<typeof environmentSchema> { return environmentSchema.parse(process.env); }

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)); }

export async function main(): Promise<void> {
  const environment = loadEnvironment();
  const redis = parseRedisUrl(environment.REDIS_URL);
  const pool = new Pool({ connectionString: environment.DATABASE_URL });
  const queue = new Queue(QUEUE_NAME, { connection: redis });
  const provider = new SmtpEmailProvider(buildSmtpConfig(environment));
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: 60 * 60 * 1000 }, { name: 'scan-overdue-reminders', data: {} });
  await queue.upsertJobScheduler(DELIVERY_SCHEDULER_ID, { every: 5 * 60 * 1000 }, { name: 'dispatch-reminder-emails', data: {} });

  const worker = new Worker(QUEUE_NAME, async (job) => {
    if (job.name === 'send-reminder-email') {
      await processReminderEmail(pool, String(job.data.companyId), String(job.data.deliveryId), provider);
      return { deliveryId: job.data.deliveryId };
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (job.name === 'scan-overdue-reminders') {
        const created = await runOverdueReminderScan(client);
        await client.query('COMMIT');
        const enqueueClient = await pool.connect();
        try { await enqueuePendingReminderEmails(enqueueClient, queue); } finally { enqueueClient.release(); }
        return { created };
      }
      if (job.name === 'dispatch-reminder-emails') {
        const queued = await enqueuePendingReminderEmails(client, queue);
        await client.query('COMMIT');
        return { queued };
      }
      await client.query('ROLLBACK');
      return { ignored: true };
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }, { connection: redis, concurrency: environment.WORKER_CONCURRENCY });

  const shutdown = async () => { await worker.close(); await queue.close(); await pool.end(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}

if (require.main === module) void main();
