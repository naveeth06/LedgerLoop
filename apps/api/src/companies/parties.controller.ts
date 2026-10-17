import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const partyTypes = ['customer', 'supplier', 'both'] as const;
const partyFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  partyType: z.enum(partyTypes),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(3).max(32).optional(),
  billingAddress: z.record(z.string(), z.unknown()).optional(),
  creditLimitPaise: z.string().regex(/^(0|[1-9][0-9]{0,17})$/).optional(),
}).strict();
const createPartySchema = partyFieldsSchema.extend({ partyCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/) }).strict();
const statusSchema = z.object({ isActive: z.boolean() }).strict();
const reminderPreferenceSchema = z.object({ enabled: z.boolean() }).strict();

@Controller('companies/:companyId/parties')
export class PartiesController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Get()
  async listParties(@Param('companyId') companyId: string, @Query('type') type: string | undefined, @Query('active') active: string | undefined, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    if (type !== undefined && !partyTypes.includes(type as typeof partyTypes[number])) throw new BadRequestException('Party type filter is invalid.');
    if (active !== undefined && active !== 'true' && active !== 'false') throw new BadRequestException('Active filter must be true or false.');
    const parties = await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query(`SELECT id, company_id, party_code, name, party_type, gstin, email, phone, billing_address, credit_limit_paise, is_active, email_reminders_enabled, created_at, updated_at FROM company_parties WHERE company_id = $1 AND ($2::text IS NULL OR party_type = $2 OR party_type = 'both') AND ($3::boolean IS NULL OR is_active = $3) ORDER BY name ASC, party_code ASC`, [companyId, type ?? null, active === undefined ? null : active === 'true']);
      return result.rows;
    });
    return { parties };
  }

  @Post()
  @CompanyRoles('owner', 'admin', 'accountant')
  async createParty(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = createPartySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Party details are invalid.');
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const inserted = await client.query(`INSERT INTO company_parties (company_id, party_code, name, party_type, gstin, email, phone, billing_address, credit_limit_paise, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::bigint,$10) RETURNING id, company_id, party_code, name, party_type, gstin, email, phone, billing_address, credit_limit_paise, is_active, email_reminders_enabled, created_at, updated_at`, [companyId, parsed.data.partyCode.toUpperCase(), parsed.data.name, parsed.data.partyType, parsed.data.gstin ?? null, parsed.data.email ?? null, parsed.data.phone ?? null, JSON.stringify(parsed.data.billingAddress ?? {}), parsed.data.creditLimitPaise ?? '0', userId]);
        const party = inserted.rows[0];
        await this.audit.record(client, { actorUserId: userId, action: 'COMPANY_PARTY_CREATED', entityType: 'company_party', entityId: party.id, metadata: { companyId, partyCode: party.party_code, partyType: party.party_type } });
        return { party };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A party with this code already exists in the company.');
      throw error;
    }
  }

  @Patch(':partyId')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateParty(@Param('companyId') companyId: string, @Param('partyId') partyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = partyFieldsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Party details are invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(`UPDATE company_parties SET name=$3, party_type=$4, gstin=$5, email=$6, phone=$7, billing_address=$8::jsonb, credit_limit_paise=$9::bigint, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id, company_id, party_code, name, party_type, gstin, email, phone, billing_address, credit_limit_paise, is_active, email_reminders_enabled, created_at, updated_at`, [companyId, partyId, parsed.data.name, parsed.data.partyType, parsed.data.gstin ?? null, parsed.data.email ?? null, parsed.data.phone ?? null, JSON.stringify(parsed.data.billingAddress ?? {}), parsed.data.creditLimitPaise ?? '0']);
      if (!updated.rows[0]) throw new BadRequestException('Party was not found.');
      await this.audit.record(client, { actorUserId: userId, action: 'COMPANY_PARTY_UPDATED', entityType: 'company_party', entityId: partyId, metadata: { companyId } });
      return { party: updated.rows[0] };
    });
  }

  @Patch(':partyId/status')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateStatus(@Param('companyId') companyId: string, @Param('partyId') partyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Party status is invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(`UPDATE company_parties SET is_active=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id, is_active`, [companyId, partyId, parsed.data.isActive]);
      if (!updated.rows[0]) throw new BadRequestException('Party was not found.');
      await this.audit.record(client, { actorUserId: userId, action: 'COMPANY_PARTY_STATUS_UPDATED', entityType: 'company_party', entityId: partyId, metadata: { companyId, isActive: parsed.data.isActive } });
      return updated.rows[0];
    });
  }

  @Patch(':partyId/reminder-preference')
  @CompanyRoles('owner', 'admin', 'accountant')
  async updateReminderPreference(@Param('companyId') companyId: string, @Param('partyId') partyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = reminderPreferenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Reminder preference is invalid.');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const updated = await client.query(`UPDATE company_parties SET email_reminders_enabled=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id, email_reminders_enabled AS "emailRemindersEnabled"`, [companyId, partyId, parsed.data.enabled]);
      if (!updated.rows[0]) throw new BadRequestException('Party was not found.');
      await this.audit.record(client, { actorUserId: userId, action: 'PARTY_REMINDER_PREFERENCE_UPDATED', entityType: 'company_party', entityId: partyId, metadata: { enabled: parsed.data.enabled } });
      return updated.rows[0];
    });
  }
}

function isUniqueViolation(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505'; }
