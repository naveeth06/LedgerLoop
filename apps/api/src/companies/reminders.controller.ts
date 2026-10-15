import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  firstAfterDays: z.number().int().min(1).max(365),
  repeatEveryDays: z.number().int().min(1).max(365),
  maxReminders: z.number().int().min(1).max(20),
}).strict();

@Controller('companies/:companyId/reminders')
export class RemindersController {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  async getSettings(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT enabled,
               first_after_days AS "firstAfterDays",
               repeat_every_days AS "repeatEveryDays",
               max_reminders AS "maxReminders"
          FROM company_reminder_settings
         WHERE company_id = $1
      `, [companyId]);
      return result.rows[0] ?? { enabled: false, firstAfterDays: 1, repeatEveryDays: 7, maxReminders: 3 };
    });
  }

  @Put('settings')
  @CompanyRoles('owner', 'admin')
  async updateSettings(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = requireUser(request);
    const parsed = reminderSettingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Reminder settings are invalid.');

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        INSERT INTO company_reminder_settings
          (company_id, enabled, first_after_days, repeat_every_days, max_reminders)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (company_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          first_after_days = EXCLUDED.first_after_days,
          repeat_every_days = EXCLUDED.repeat_every_days,
          max_reminders = EXCLUDED.max_reminders,
          updated_at = now()
        RETURNING enabled,
                  first_after_days AS "firstAfterDays",
                  repeat_every_days AS "repeatEveryDays",
                  max_reminders AS "maxReminders"
      `, [companyId, parsed.data.enabled, parsed.data.firstAfterDays, parsed.data.repeatEveryDays, parsed.data.maxReminders]);

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'REMINDER_SETTINGS_UPDATED',
        entityType: 'company_reminder_settings',
        entityId: companyId,
        metadata: parsed.data,
      });
      return result.rows[0];
    });
  }

  @Get('events')
  async listEvents(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT e.id,
               e.invoice_id AS "invoiceId",
               i.invoice_number AS "invoiceNumber",
               e.party_id AS "partyId",
               p.name AS "partyName",
               p.email AS "partyEmail",
               e.reminder_sequence AS "reminderSequence",
               e.due_date AS "dueDate",
               e.outstanding_paise AS "outstandingPaise",
               e.status,
               e.created_at AS "createdAt",
               e.acknowledged_at AS "acknowledgedAt"
          FROM overdue_reminder_events e
          JOIN sales_invoices i ON i.company_id = e.company_id AND i.id = e.invoice_id
          JOIN company_parties p ON p.company_id = e.company_id AND p.id = e.party_id
         WHERE e.company_id = $1
         ORDER BY e.status ASC, e.created_at DESC
      `, [companyId]);
      return { events: result.rows };
    });
  }

  @Get('deliveries/summary')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async deliverySummary(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        SELECT status,
               COUNT(*)::int AS count,
               MIN(created_at) AS "oldestCreatedAt",
               MAX(updated_at) AS "lastUpdatedAt"
          FROM reminder_email_deliveries
         WHERE company_id = $1
         GROUP BY status
         ORDER BY status
      `, [companyId]);

      const counts = { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 };
      for (const row of result.rows as Array<{ status: keyof typeof counts; count: number }>) {
        if (row.status in counts) counts[row.status] = Number(row.count);
      }
      return { counts, statuses: result.rows };
    });
  }

  @Post('events/:eventId/acknowledge')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async acknowledgeEvent(@Param('companyId') companyId: string, @Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    const userId = requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`
        UPDATE overdue_reminder_events
           SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2
         WHERE company_id = $1 AND id = $3 AND status = 'pending'
         RETURNING id, invoice_id AS "invoiceId", status, acknowledged_at AS "acknowledgedAt"
      `, [companyId, userId, eventId]);
      if (result.rowCount !== 1) throw new BadRequestException('Reminder event was not found or is already acknowledged.');

      await this.audit.record(client, {
        actorUserId: userId,
        action: 'OVERDUE_REMINDER_ACKNOWLEDGED',
        entityType: 'overdue_reminder_event',
        entityId: eventId,
        metadata: { invoiceId: result.rows[0].invoiceId },
      });
      return result.rows[0];
    });
  }
}

function requireUser(request: AuthenticatedRequest): string {
  const userId = request.user?.sub;
  if (!userId) throw new BadRequestException('Authenticated user is required.');
  return userId;
}
