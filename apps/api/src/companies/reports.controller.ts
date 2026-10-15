import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantAccessService } from '../database/tenant-access.service';
import type { AuthenticatedRequest } from '../auth/current-user';

const trialBalanceQuerySchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitPaise: string;
  creditPaise: string;
  debitBalancePaise: string;
  creditBalancePaise: string;
}

@Controller('companies/:companyId/reports')
export class ReportsController {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  @Get('trial-balance')
  async trialBalance(
    @Param('companyId') companyId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');

    const parsed = trialBalanceQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Trial balance parameters are invalid.');

    const asOfDate = parsed.data.asOfDate ?? new Date().toISOString().slice(0, 10);
    if (!isValidIsoDate(asOfDate)) {
      throw new BadRequestException('asOfDate must be a valid calendar date.');
    }

    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query<{
        account_id: string;
        account_code: string;
        account_name: string;
        account_type: string;
        debit_paise: string;
        credit_paise: string;
      }>(
        `SELECT
           a.id AS account_id,
           a.account_code,
           a.name AS account_name,
           a.account_type,
           COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_paise ELSE 0 END), 0)::text AS debit_paise,
           COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_paise ELSE 0 END), 0)::text AS credit_paise
         FROM ledger_accounts a
         LEFT JOIN journal_lines jl
           ON jl.company_id = a.company_id
          AND jl.account_id = a.id
         LEFT JOIN journal_entries je
           ON je.company_id = jl.company_id
          AND je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.entry_date <= $2::date
         WHERE a.company_id = $1
         GROUP BY a.id, a.account_code, a.name, a.account_type
         ORDER BY a.account_code ASC, a.id ASC`,
        [companyId, asOfDate],
      );

      const rows: TrialBalanceRow[] = result.rows.map((row) => {
        const debit = BigInt(row.debit_paise);
        const credit = BigInt(row.credit_paise);
        const net = debit - credit;
        return {
          accountId: row.account_id,
          accountCode: row.account_code,
          accountName: row.account_name,
          accountType: row.account_type,
          debitPaise: row.debit_paise,
          creditPaise: row.credit_paise,
          debitBalancePaise: net > 0n ? net.toString() : '0',
          creditBalancePaise: net < 0n ? (-net).toString() : '0',
        };
      });

      const totals = rows.reduce(
        (acc, row) => ({
          debitPaise: (BigInt(acc.debitPaise) + BigInt(row.debitBalancePaise)).toString(),
          creditPaise: (BigInt(acc.creditPaise) + BigInt(row.creditBalancePaise)).toString(),
        }),
        { debitPaise: '0', creditPaise: '0' },
      );

      return {
        report: 'trial-balance',
        companyId,
        asOfDate,
        rows,
        totals,
        balanced: totals.debitPaise === totals.creditPaise,
      };
    });
  }
}

function isValidIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
