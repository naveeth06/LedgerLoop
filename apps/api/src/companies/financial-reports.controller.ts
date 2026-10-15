import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { TenantAccessService } from '../database/tenant-access.service';
import type { AuthenticatedRequest } from '../auth/current-user';

const rangeSchema = z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

@Controller('companies/:companyId/reports')
export class FinancialReportsController {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  @Get('profit-and-loss')
  async profitAndLoss(@Param('companyId') companyId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const { fromDate, toDate } = parseRange(query);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const rows = await ledgerRows(client, companyId, fromDate, toDate, ['income', 'expense']);
      let income = 0n; let expense = 0n;
      const accounts = rows.map((row) => {
        const balance = row.accountType === 'income' ? BigInt(row.creditPaise) - BigInt(row.debitPaise) : BigInt(row.debitPaise) - BigInt(row.creditPaise);
        if (row.accountType === 'income') income += balance; else expense += balance;
        return { ...row, balancePaise: balance.toString() };
      });
      return { report: 'profit-and-loss', companyId, fromDate, toDate, incomePaise: income.toString(), expensePaise: expense.toString(), netProfitPaise: (income - expense).toString(), accounts };
    });
  }

  @Get('balance-sheet')
  async balanceSheet(@Param('companyId') companyId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    const parsed = z.object({ asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict().safeParse(query);
    if (!parsed.success) throw new BadRequestException('Balance sheet parameters are invalid.');
    const asOfDate = parsed.data.asOfDate ?? new Date().toISOString().slice(0, 10);
    validateDate(asOfDate, 'asOfDate');
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const rows = await ledgerRows(client, companyId, undefined, asOfDate, ['asset', 'liability', 'equity']);
      const accounts = rows.map((row) => ({ ...row, balancePaise: balanceForType(row.accountType, row.debitPaise, row.creditPaise).toString() }));
      let assets = 0n; let liabilities = 0n; let equity = 0n;
      for (const row of accounts) {
        if (row.accountType === 'asset') assets += BigInt(row.balancePaise);
        if (row.accountType === 'liability') liabilities += BigInt(row.balancePaise);
        if (row.accountType === 'equity') equity += BigInt(row.balancePaise);
      }
      const retainedEarnings = await netIncome(client, companyId, asOfDate);
      const liabilitiesAndEquity = liabilities + equity + retainedEarnings;
      return { report: 'balance-sheet', companyId, asOfDate, accounts, totals: { assetPaise: assets.toString(), liabilityPaise: liabilities.toString(), equityPaise: equity.toString(), retainedEarningsPaise: retainedEarnings.toString(), liabilitiesAndEquityPaise: liabilitiesAndEquity.toString() }, balanced: assets === liabilitiesAndEquity };
    });
  }
}

function parseRange(query: unknown): { fromDate: string; toDate: string } {
  const parsed = rangeSchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException('Financial report parameters are invalid.');
  const now = new Date();
  const fromDate = parsed.data.fromDate ?? `${now.getUTCFullYear()}-01-01`;
  const toDate = parsed.data.toDate ?? now.toISOString().slice(0, 10);
  validateDate(fromDate, 'fromDate'); validateDate(toDate, 'toDate');
  if (fromDate > toDate) throw new BadRequestException('fromDate must be on or before toDate.');
  return { fromDate, toDate };
}

function validateDate(value: string, field: string): void {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} must be a valid calendar date.`);
}

async function ledgerRows(client: any, companyId: string, fromDate: string | undefined, toDate: string, types: string[]) {
  const params: unknown[] = [companyId, toDate, types];
  let dateClause = 'je.entry_date <= $2::date';
  if (fromDate) { params.push(fromDate); dateClause += ' AND je.entry_date >= $4::date'; }
  const result = await client.query(`SELECT a.id AS "accountId", a.account_code AS "accountCode", a.name AS "accountName", a.account_type AS "accountType", COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_paise ELSE 0 END), 0)::text AS "debitPaise", COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_paise ELSE 0 END), 0)::text AS "creditPaise" FROM ledger_accounts a LEFT JOIN journal_lines jl ON jl.company_id = a.company_id AND jl.account_id = a.id LEFT JOIN journal_entries je ON je.company_id = jl.company_id AND je.id = jl.journal_entry_id AND je.status = 'posted' AND ${dateClause} WHERE a.company_id = $1 AND a.account_type = ANY($3::text[]) GROUP BY a.id, a.account_code, a.name, a.account_type ORDER BY a.account_code ASC, a.id ASC`, params);
  return result.rows;
}

async function netIncome(client: any, companyId: string, asOfDate: string): Promise<bigint> {
  const rows = await ledgerRows(client, companyId, undefined, asOfDate, ['income', 'expense']);
  return rows.reduce((total: bigint, row: any) => total + (row.accountType === 'income' ? BigInt(row.creditPaise) - BigInt(row.debitPaise) : BigInt(row.debitPaise) - BigInt(row.creditPaise)), 0n);
}

function balanceForType(type: string, debit: string, credit: string): bigint {
  return type === 'asset' ? BigInt(debit) - BigInt(credit) : BigInt(credit) - BigInt(debit);
}
