import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CompanyRoles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/current-user';
import { AuditService } from '../database/audit.service';
import { TenantAccessService } from '../database/tenant-access.service';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paiseSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const positivePaiseSchema = z.string().regex(/^[1-9][0-9]{0,17}$/);
const expenseSchema = z.object({
  expenseDate: dateSchema,
  expenseAccountId: z.string().uuid(),
  paymentAccountId: z.string().uuid(),
  partyId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  taxablePaise: positivePaiseSchema,
  cgstPaise: paiseSchema.optional(),
  sgstPaise: paiseSchema.optional(),
  igstPaise: paiseSchema.optional(),
}).strict();
const debitNoteSchema = z.object({
  noteDate: dateSchema,
  purchaseBillId: z.string().uuid(),
  taxablePaise: positivePaiseSchema,
  cgstPaise: paiseSchema.optional(),
  sgstPaise: paiseSchema.optional(),
  igstPaise: paiseSchema.optional(),
  reason: z.string().trim().min(3).max(500),
}).strict();

type Account = { id: string; account_type: string; is_active: boolean };

function uniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

function totals(data: { taxablePaise: string; cgstPaise?: string; sgstPaise?: string; igstPaise?: string }) {
  const taxable = BigInt(data.taxablePaise);
  const cgst = BigInt(data.cgstPaise ?? '0');
  const sgst = BigInt(data.sgstPaise ?? '0');
  const igst = BigInt(data.igstPaise ?? '0');
  const total = taxable + cgst + sgst + igst;
  return { taxable, cgst, sgst, igst, total };
}

@Controller('companies/:companyId')
export class ExpensesDebitNotesController {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly audit: AuditService) {}

  @Post('expenses')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createExpense(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Expense details are invalid.');
    const data = parsed.data;
    const { taxable, cgst, sgst, igst, total } = totals(data);
    if (total <= 0n) throw new BadRequestException('Expense total must be positive.');
    if (data.expenseAccountId === data.paymentAccountId) throw new BadRequestException('Expense and payment accounts must be different.');

    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const accounts = await client.query<Account>('SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, [data.expenseAccountId, data.paymentAccountId]]);
        if (accounts.rows.length !== 2 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Expense and payment accounts must be active accounts in this company.');
        const byId = new Map(accounts.rows.map((row) => [row.id, row]));
        if (byId.get(data.expenseAccountId)?.account_type !== 'expense') throw new BadRequestException('expenseAccountId must reference an expense account.');
        if (byId.get(data.paymentAccountId)?.account_type !== 'asset') throw new BadRequestException('paymentAccountId must reference an asset account.');
        if (data.partyId) {
          const party = await client.query('SELECT id FROM company_parties WHERE company_id = $1 AND id = $2 AND is_active = true', [companyId, data.partyId]);
          if (!party.rows[0]) throw new BadRequestException('partyId must reference an active party in this company.');
        }

        const documentId = randomUUID();
        await client.query('INSERT INTO company_document_sequences (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING', [companyId]);
        const sequence = await client.query<{ next: string }>('SELECT expense_next::text AS next FROM company_document_sequences WHERE company_id = $1 FOR UPDATE', [companyId]);
        const next = BigInt(sequence.rows[0].next);
        await client.query('UPDATE company_document_sequences SET expense_next = $2::bigint, updated_at = now() WHERE company_id = $1', [companyId, (next + 1n).toString()]);
        const expenseNumber = `EXP-${new Date(data.expenseDate).getFullYear()}-${next.toString().padStart(6, '0')}`;
        await client.query(`INSERT INTO expense_documents (id, company_id, expense_number, expense_date, expense_account_id, payment_account_id, party_id, description, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, created_by) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9::bigint,$10::bigint,$11::bigint,$12::bigint,$13::bigint,$14)`, [documentId, companyId, expenseNumber, data.expenseDate, data.expenseAccountId, data.paymentAccountId, data.partyId ?? null, data.description, taxable.toString(), cgst.toString(), sgst.toString(), igst.toString(), total.toString(), userId]);
        await this.audit.record(client, { actorUserId: userId, action: 'EXPENSE_DRAFT_CREATED', entityType: 'expense_document', entityId: documentId, metadata: { companyId, expenseNumber, totalPaise: total.toString() } });
        return { id: documentId, expenseNumber, status: 'draft', totals: { taxablePaise: taxable.toString(), cgstPaise: cgst.toString(), sgstPaise: sgst.toString(), igstPaise: igst.toString(), totalPaise: total.toString() } };
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new ConflictException('The expense number already exists. Please retry.');
      throw error;
    }
  }

  @Get('expenses')
  async listExpenses(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query('SELECT id, expense_number AS "expenseNumber", expense_date AS "expenseDate", description, status, taxable_paise::text AS "taxablePaise", cgst_paise::text AS "cgstPaise", sgst_paise::text AS "sgstPaise", igst_paise::text AS "igstPaise", total_paise::text AS "totalPaise", created_at AS "createdAt" FROM expense_documents WHERE company_id = $1 ORDER BY expense_date DESC, expense_number DESC', [companyId]);
      return { expenses: result.rows };
    });
  }

  @Post('expenses/:expenseId/post')
  @CompanyRoles('owner', 'admin', 'accountant')
  async postExpense(@Param('companyId') companyId: string, @Param('expenseId') expenseId: string, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const expenseResult = await client.query<{ id: string; expense_number: string; expense_date: string; expense_account_id: string; payment_account_id: string; taxable_paise: string; cgst_paise: string; sgst_paise: string; igst_paise: string; total_paise: string; status: string }>('SELECT id, expense_number, expense_date, expense_account_id, payment_account_id, taxable_paise::text, cgst_paise::text, sgst_paise::text, igst_paise::text, total_paise::text, status FROM expense_documents WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, expenseId]);
      const expense = expenseResult.rows[0];
      if (!expense) throw new BadRequestException('Expense was not found in this company.');
      if (expense.status !== 'draft') throw new ConflictException('Only draft expenses can be posted.');
      const { taxable, cgst, sgst, igst, total } = totals({ taxablePaise: expense.taxable_paise, cgstPaise: expense.cgst_paise, sgstPaise: expense.sgst_paise, igstPaise: expense.igst_paise });
      if (total.toString() !== expense.total_paise) throw new BadRequestException('Expense totals are invalid.');
      const accounts = await client.query<Account>('SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, [expense.expense_account_id, expense.payment_account_id]]);
      const byId = new Map(accounts.rows.map((row) => [row.id, row]));
      if (accounts.rows.length !== 2 || accounts.rows.some((row) => !row.is_active) || byId.get(expense.expense_account_id)?.account_type !== 'expense' || byId.get(expense.payment_account_id)?.account_type !== 'asset') throw new BadRequestException('Expense posting accounts must remain active and have the correct account types.');
      const gstConfig = await client.query<{ input_cgst_account_id: string; input_sgst_account_id: string; input_igst_account_id: string }>('SELECT input_cgst_account_id, input_sgst_account_id, input_igst_account_id FROM purchase_posting_accounts WHERE company_id = $1', [companyId]);
      if ((cgst > 0n || sgst > 0n || igst > 0n) && !gstConfig.rows[0]) throw new BadRequestException('Configure purchase posting accounts before posting an expense with GST.');
      const entryId = randomUUID();
      await client.query(`INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by) VALUES ($1,$2,$3,$4::date,$5,'draft','expense',$6)`, [entryId, companyId, `EXP-${expense.expense_number}`, expense.expense_date, `Expense ${expense.expense_number}`, userId]);
      const lines: Array<{ accountId: string; description: string; debit: string; credit: string }> = [{ accountId: expense.expense_account_id, description: `Expense - ${expense.expense_number}`, debit: taxable.toString(), credit: '0' }];
      if (cgst > 0n) lines.push({ accountId: gstConfig.rows[0].input_cgst_account_id, description: `Input CGST - ${expense.expense_number}`, debit: cgst.toString(), credit: '0' });
      if (sgst > 0n) lines.push({ accountId: gstConfig.rows[0].input_sgst_account_id, description: `Input SGST - ${expense.expense_number}`, debit: sgst.toString(), credit: '0' });
      if (igst > 0n) lines.push({ accountId: gstConfig.rows[0].input_igst_account_id, description: `Input IGST - ${expense.expense_number}`, debit: igst.toString(), credit: '0' });
      lines.push({ accountId: expense.payment_account_id, description: `Payment - ${expense.expense_number}`, debit: '0', credit: total.toString() });
      for (let index = 0; index < lines.length; index++) await client.query('INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1,$2,$3,$4,$5,$6::bigint,$7::bigint)', [companyId, entryId, index + 1, lines[index].accountId, lines[index].description, lines[index].debit, lines[index].credit]);
      await client.query("UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2", [companyId, entryId, userId]);
      await client.query("UPDATE expense_documents SET status = 'posted', journal_entry_id = $3, updated_at = now() WHERE company_id = $1 AND id = $2", [companyId, expenseId, entryId]);
      await this.audit.record(client, { actorUserId: userId, action: 'EXPENSE_POSTED', entityType: 'expense_document', entityId: expenseId, metadata: { companyId, expenseNumber: expense.expense_number, journalEntryId: entryId, totalPaise: total.toString() } });
      await this.audit.record(client, { actorUserId: userId, action: 'JOURNAL_ENTRY_POSTED', entityType: 'journal_entry', entityId: entryId, metadata: { companyId, sourceType: 'expense', expenseId } });
      return { expenseId, expenseNumber: expense.expense_number, status: 'posted', journalEntryId: entryId, totalPaise: total.toString() };
    });
  }

  @Post('purchases/debit-notes')
  @CompanyRoles('owner', 'admin', 'accountant', 'staff')
  async createDebitNote(@Param('companyId') companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    const parsed = debitNoteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Supplier debit note details are invalid.');
    const data = parsed.data;
    const { taxable, cgst, sgst, igst, total } = totals(data);
    if (total <= 0n) throw new BadRequestException('Supplier debit note total must be positive.');
    try {
      return await this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
        const billResult = await client.query<{ id: string; party_id: string; status: string; total_paise: string }>('SELECT id, party_id, status, total_paise::text FROM purchase_bills WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, data.purchaseBillId]);
        const bill = billResult.rows[0];
        if (!bill || bill.status !== 'received') throw new BadRequestException('Debit notes can only reference a received purchase bill in this company.');
        const documentId = randomUUID();
        await client.query('INSERT INTO company_document_sequences (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING', [companyId]);
        const sequence = await client.query<{ next: string }>('SELECT supplier_debit_note_next::text AS next FROM company_document_sequences WHERE company_id = $1 FOR UPDATE', [companyId]);
        const next = BigInt(sequence.rows[0].next);
        await client.query('UPDATE company_document_sequences SET supplier_debit_note_next = $2::bigint, updated_at = now() WHERE company_id = $1', [companyId, (next + 1n).toString()]);
        const number = `DN-${new Date(data.noteDate).getFullYear()}-${next.toString().padStart(6, '0')}`;
        await client.query(`INSERT INTO supplier_debit_notes (id, company_id, debit_note_number, note_date, purchase_bill_id, party_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, reason, created_by) VALUES ($1,$2,$3,$4::date,$5,$6,$7::bigint,$8::bigint,$9::bigint,$10::bigint,$11::bigint,$12,$13)`, [documentId, companyId, number, data.noteDate, data.purchaseBillId, bill.party_id, taxable.toString(), cgst.toString(), sgst.toString(), igst.toString(), total.toString(), data.reason, userId]);
        await this.audit.record(client, { actorUserId: userId, action: 'SUPPLIER_DEBIT_NOTE_DRAFT_CREATED', entityType: 'supplier_debit_note', entityId: documentId, metadata: { companyId, debitNoteNumber: number, purchaseBillId: data.purchaseBillId, totalPaise: total.toString() } });
        return { id: documentId, debitNoteNumber: number, purchaseBillId: data.purchaseBillId, partyId: bill.party_id, status: 'draft', totals: { taxablePaise: taxable.toString(), cgstPaise: cgst.toString(), sgstPaise: sgst.toString(), igstPaise: igst.toString(), totalPaise: total.toString() } };
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new ConflictException('The supplier debit note number already exists. Please retry.');
      throw error;
    }
  }

  @Get('purchases/debit-notes')
  async listDebitNotes(@Param('companyId') companyId: string, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const result = await client.query('SELECT n.id, n.debit_note_number AS "debitNoteNumber", n.note_date AS "noteDate", n.purchase_bill_id AS "purchaseBillId", n.party_id AS "partyId", n.status, n.taxable_paise::text AS "taxablePaise", n.cgst_paise::text AS "cgstPaise", n.sgst_paise::text AS "sgstPaise", n.igst_paise::text AS "igstPaise", n.total_paise::text AS "totalPaise", n.reason, n.created_at AS "createdAt" FROM supplier_debit_notes n WHERE n.company_id = $1 ORDER BY n.note_date DESC, n.debit_note_number DESC', [companyId]);
      return { debitNotes: result.rows };
    });
  }

  @Post('purchases/debit-notes/:debitNoteId/post')
  @CompanyRoles('owner', 'admin', 'accountant')
  async postDebitNote(@Param('companyId') companyId: string, @Param('debitNoteId') debitNoteId: string, @Req() request: AuthenticatedRequest) {
    const userId = this.requireUser(request);
    return this.tenantAccess.withCompanyTransaction(userId, companyId, async (client) => {
      const noteResult = await client.query<{ id: string; debit_note_number: string; note_date: string; purchase_bill_id: string; party_id: string; taxable_paise: string; cgst_paise: string; sgst_paise: string; igst_paise: string; total_paise: string; status: string }>('SELECT id, debit_note_number, note_date, purchase_bill_id, party_id, taxable_paise::text, cgst_paise::text, sgst_paise::text, igst_paise::text, total_paise::text, status FROM supplier_debit_notes WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, debitNoteId]);
      const note = noteResult.rows[0];
      if (!note) throw new BadRequestException('Supplier debit note was not found in this company.');
      if (note.status !== 'draft') throw new ConflictException('Only draft supplier debit notes can be posted.');
      const billResult = await client.query<{ party_id: string; status: string; total_paise: string }>('SELECT party_id, status, total_paise::text FROM purchase_bills WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, note.purchase_bill_id]);
      const bill = billResult.rows[0];
      if (!bill || bill.status !== 'received' || bill.party_id !== note.party_id) throw new BadRequestException('Referenced purchase bill is no longer eligible for this debit note.');
      const { taxable, cgst, sgst, igst, total } = totals({ taxablePaise: note.taxable_paise, cgstPaise: note.cgst_paise, sgstPaise: note.sgst_paise, igstPaise: note.igst_paise });
      if (total.toString() !== note.total_paise) throw new BadRequestException('Supplier debit note totals are invalid.');
      const settled = await client.query<{ paid: string; debited: string }>(`SELECT COALESCE((SELECT SUM(a.allocated_paise) FROM supplier_payment_allocations a JOIN supplier_payments p ON p.company_id = a.company_id AND p.id = a.payment_id WHERE a.company_id = $1 AND a.bill_id = $2 AND p.status = 'posted'),0)::text AS paid, COALESCE((SELECT SUM(n2.total_paise) FROM supplier_debit_notes n2 WHERE n2.company_id = $1 AND n2.purchase_bill_id = $2 AND n2.status = 'posted' AND n2.id <> $3),0)::text AS debited`, [companyId, note.purchase_bill_id, debitNoteId]);
      const outstanding = BigInt(bill.total_paise) - BigInt(settled.rows[0].paid) - BigInt(settled.rows[0].debited);
      if (total > outstanding) throw new BadRequestException('Supplier debit note cannot exceed the bill amount remaining after posted payments and debit notes.');
      const configResult = await client.query<{ payable_account_id: string; purchase_account_id: string; input_cgst_account_id: string; input_sgst_account_id: string; input_igst_account_id: string }>('SELECT payable_account_id, purchase_account_id, input_cgst_account_id, input_sgst_account_id, input_igst_account_id FROM purchase_posting_accounts WHERE company_id = $1', [companyId]);
      const config = configResult.rows[0];
      if (!config) throw new BadRequestException('Configure purchase posting accounts before posting a supplier debit note.');
      const accountIds = [config.payable_account_id, config.purchase_account_id, config.input_cgst_account_id, config.input_sgst_account_id, config.input_igst_account_id];
      const accounts = await client.query<Account>('SELECT id, account_type, is_active FROM ledger_accounts WHERE company_id = $1 AND id = ANY($2::uuid[])', [companyId, accountIds]);
      if (accounts.rows.length !== 5 || accounts.rows.some((row) => !row.is_active)) throw new BadRequestException('Configured purchase posting accounts must all remain active.');
      const entryId = randomUUID();
      await client.query(`INSERT INTO journal_entries (id, company_id, entry_number, entry_date, memo, status, source_type, created_by) VALUES ($1,$2,$3,$4::date,$5,'draft','supplier_debit_note',$6)`, [entryId, companyId, `DN-${note.debit_note_number}`, note.note_date, `Supplier debit note ${note.debit_note_number}`, userId]);
      const lines: Array<{ accountId: string; description: string; debit: string; credit: string }> = [{ accountId: config.payable_account_id, description: `Accounts payable reduction - ${note.debit_note_number}`, debit: total.toString(), credit: '0' }];
      if (taxable > 0n) lines.push({ accountId: config.purchase_account_id, description: `Purchase return - ${note.debit_note_number}`, debit: '0', credit: taxable.toString() });
      if (cgst > 0n) lines.push({ accountId: config.input_cgst_account_id, description: `Input CGST reversal - ${note.debit_note_number}`, debit: '0', credit: cgst.toString() });
      if (sgst > 0n) lines.push({ accountId: config.input_sgst_account_id, description: `Input SGST reversal - ${note.debit_note_number}`, debit: '0', credit: sgst.toString() });
      if (igst > 0n) lines.push({ accountId: config.input_igst_account_id, description: `Input IGST reversal - ${note.debit_note_number}`, debit: '0', credit: igst.toString() });
      for (let index = 0; index < lines.length; index++) await client.query('INSERT INTO journal_lines (company_id, journal_entry_id, line_number, account_id, description, debit_paise, credit_paise) VALUES ($1,$2,$3,$4,$5,$6::bigint,$7::bigint)', [companyId, entryId, index + 1, lines[index].accountId, lines[index].description, lines[index].debit, lines[index].credit]);
      await client.query("UPDATE journal_entries SET status = 'posted', posted_by = $3, posted_at = now(), updated_at = now() WHERE company_id = $1 AND id = $2", [companyId, entryId, userId]);
      await client.query("UPDATE supplier_debit_notes SET status = 'posted', journal_entry_id = $3, updated_at = now() WHERE company_id = $1 AND id = $2", [companyId, debitNoteId, entryId]);
      await this.audit.record(client, { actorUserId: userId, action: 'SUPPLIER_DEBIT_NOTE_POSTED', entityType: 'supplier_debit_note', entityId: debitNoteId, metadata: { companyId, debitNoteNumber: note.debit_note_number, purchaseBillId: note.purchase_bill_id, journalEntryId: entryId, totalPaise: total.toString() } });
      await this.audit.record(client, { actorUserId: userId, action: 'JOURNAL_ENTRY_POSTED', entityType: 'journal_entry', entityId: entryId, metadata: { companyId, sourceType: 'supplier_debit_note', debitNoteId } });
      return { debitNoteId, debitNoteNumber: note.debit_note_number, status: 'posted', journalEntryId: entryId, totalPaise: total.toString() };
    });
  }

  private requireUser(request: AuthenticatedRequest): string {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('Authenticated user is required.');
    return userId;
  }
}
