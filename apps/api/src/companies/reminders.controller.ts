import { BadRequestException, Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
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
  async getSettings(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
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

      return result.rows[0] ?? {
        enabled: false,
        firstAfterDays: 1,
        repeatEveryDays: 7,
        maxReminders: 3,
      };
    });
  }

  @Put('settings')
  @CompanyRoles('owner', 'admin')
  async updateSettings(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
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
      `, [
        companyId,
        parsed.data.enabled,
        parsed.data.firstAfterDays,
        parsed.data.repeatEveryDays,
        parsed.data.maxReminders,
      ]);

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
}

function requireUser(request: AuthenticatedRequest): string {
  const userId = request.user?.sub;
  if (!userId) throw new BadRequestException('Authenticated user is required.');
  return userId;
}
