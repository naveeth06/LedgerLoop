import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const updateSettingsSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const createGstRegistrationSchema = z.object({
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).optional(),
  registrationType: z.enum(['regular', 'composition', 'casual', 'sez', 'non_resident']).default('regular'),
  isPrimary: z.boolean().default(false),
}).strict();

@Controller('companies/:companyId')
export class CompanySettingsController {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  async getSettings(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<{
        id: string; legal_name: string; display_name: string; base_currency: string; created_at: Date;
      }>(
        'SELECT id, legal_name, display_name, base_currency, created_at FROM companies WHERE id = $1 LIMIT 1',
        [companyId],
      );
      return { settings: result.rows[0] ?? null };
    });
  }

  @Patch('settings')
  @CompanyRoles('owner', 'admin')
  async updateSettings(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Company settings are invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `UPDATE companies
            SET legal_name = COALESCE($2, legal_name),
                display_name = COALESCE($3, display_name),
                updated_at = now()
          WHERE id = $1
          RETURNING id, legal_name, display_name, base_currency, created_at, updated_at`,
        [companyId, parsed.data.legalName ?? null, parsed.data.displayName ?? null],
      );
      const settings = result.rows[0];
      await this.audit.record(client, {
        actorUserId: userId,
        action: 'COMPANY_SETTINGS_UPDATED',
        entityType: 'company',
        entityId: companyId,
        metadata: { changedFields: Object.keys(parsed.data) },
      });
      return { settings };
    });
  }

  @Get('gst-registrations')
  async listGstRegistrations(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const registrations = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(
        `SELECT id, company_id, gstin, legal_name, trade_name, state_code,
                registration_type, is_primary, is_active, created_at, updated_at
           FROM gst_registrations
          WHERE company_id = $1
          ORDER BY is_primary DESC, gstin ASC`,
        [companyId],
      );
      return result.rows;
    });
    return { registrations };
  }

  @Post('gst-registrations')
  @CompanyRoles('owner', 'admin', 'accountant')
  async createGstRegistration(
    @Param('companyId') companyId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createGstRegistrationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('GST registration details are invalid.');
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        if (parsed.data.isPrimary) {
          // The partial unique index enforces one active primary registration. We do not
          // silently demote an existing primary; callers must resolve that explicitly.
        }
        const gstin = parsed.data.gstin;
        const inserted = await client.query(
          `INSERT INTO gst_registrations
             (company_id, gstin, legal_name, trade_name, state_code, registration_type, is_primary, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, company_id, gstin, legal_name, trade_name, state_code,
                     registration_type, is_primary, is_active, created_at, updated_at`,
          [
            companyId, gstin, parsed.data.legalName, parsed.data.tradeName ?? null,
            gstin.slice(0, 2), parsed.data.registrationType, parsed.data.isPrimary, userId,
          ],
        );
        const registration = inserted.rows[0];
        await this.audit.record(client, {
          actorUserId: userId,
          action: 'GST_REGISTRATION_CREATED',
          entityType: 'gst_registration',
          entityId: registration.id,
          metadata: { companyId, gstin, registrationType: parsed.data.registrationType },
        });
        return { registration };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This GSTIN already exists or the company already has an active primary GST registration.');
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === '23505';
}
