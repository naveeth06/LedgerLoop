import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LucideAlertCircle, LucideCheckCircle2, LucideCoins, LucidePlus, LucideRefreshCw, LucideTrash2 } from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type Party = {
  id: string;
  party_code: string;
  name: string;
  party_type: 'customer' | 'supplier' | 'both';
  is_active: boolean;
};

type Account = {
  id: string;
  account_code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  is_active: boolean;
};

type OutstandingInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalPaise: string;
  allocatedPaise: string;
  outstandingPaise: string;
};

type Allocation = { invoiceId: string; amount: string };

@Component({
  selector: 'll-sales-receipts-page',
  standalone: true,
  imports: [LucideAlertCircle, LucideCheckCircle2, LucideCoins, LucidePlus, LucideRefreshCw, LucideTrash2],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"><svg lucideCoins [size]="19"></svg></span>
            <div><p class="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">Sales</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Receipts</h1></div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Record customer collections, allocate them against outstanding invoices, and post the receipt to the ledger.</p>
        </div>
        <button type="button" class="ll-primary-button" (click)="resetForm()"><svg lucidePlus [size]="16"></svg>New receipt</button>
      </div>

      @if (errorMessage()) { <div class="mt-6 flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><svg lucideAlertCircle [size]="16"></svg><span>{{ errorMessage() }}</span></div> }
      @if (successMessage()) { <div class="mt-6 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status"><svg lucideCheckCircle2 [size]="17" class="mt-0.5 shrink-0"></svg><div>{{ successMessage() }}</div></div> }

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <section class="rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
          <div class="border-b border-white/8 px-5 py-4 sm:px-6">
            <p class="text-sm font-semibold text-white">Customer receipt</p>
            <p class="mt-1 text-xs text-[var(--ll-text-muted)]">A posted receipt debits the selected bank/cash asset and credits accounts receivable.</p>
          </div>
          <form class="space-y-5 p-5 sm:p-6" (submit)="saveReceipt($event)">
            <div class="grid gap-4 sm:grid-cols-3">
              <label><span class="ll-label">Customer</span><select class="ll-input mt-1.5 w-full" required [value]="partyId()" (change)="partyId.set($any($event.target).value); loadOutstanding()"><option value="">Select customer</option>@for (party of customers(); track party.id) { <option [value]="party.id">{{ party.name }} · {{ party.party_code }}</option> }</select></label>
              <label><span class="ll-label">Receipt date</span><input class="ll-input mt-1.5 w-full" type="date" required [value]="receiptDate()" (input)="receiptDate.set($any($event.target).value)" /></label>
              <label><span class="ll-label">Bank / cash account</span><select class="ll-input mt-1.5 w-full" required [value]="accountId()" (change)="accountId.set($any($event.target).value)"><option value="">Select asset account</option>@for (account of assetAccounts(); track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.name }}</option> }</select></label>
            </div>
            <div class="grid gap-4 sm:grid-cols-3">
              <label><span class="ll-label">Amount received ₹</span><input class="ll-input mt-1.5 w-full" required inputmode="decimal" min="0.01" [value]="amount()" (input)="amount.set($any($event.target).value)" placeholder="25000.00" /></label>
              <label><span class="ll-label">Reference <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full" maxlength="160" [value]="reference()" (input)="reference.set($any($event.target).value)" placeholder="UTR / cheque / transaction ref" /></label>
              <label><span class="ll-label">Notes <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full" maxlength="5000" [value]="notes()" (input)="notes.set($any($event.target).value)" placeholder="Collection notes" /></label>
            </div>

            <div class="rounded-xl border border-white/8">
              <div class="flex flex-col gap-3 border-b border-white/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p class="text-xs font-semibold text-white">Invoice allocation</p><p class="mt-0.5 text-[11px] text-zinc-500">Allocate all or part of the receipt. Any remaining amount stays unallocated on the customer account.</p></div>
                <button type="button" class="ll-secondary-button" [disabled]="!partyId() || loadingInvoices()" (click)="loadOutstanding()"><svg lucideRefreshCw [size]="14" [class.animate-spin]="loadingInvoices()"></svg>Refresh invoices</button>
              </div>
              @if (!partyId()) { <div class="px-5 py-10 text-center text-xs text-zinc-500">Select a customer to load outstanding invoices.</div> }
              @else if (loadingInvoices()) { <div class="space-y-3 p-5">@for (row of [1,2,3]; track row) { <div class="h-12 animate-pulse rounded-lg bg-white/[0.035]"></div> }</div> }
              @else if (outstandingInvoices().length === 0) { <div class="px-5 py-10 text-center"><p class="text-sm font-medium text-zinc-300">No outstanding invoices</p><p class="mt-1 text-xs text-zinc-500">You can still record an unallocated customer advance.</p></div> }
              @else { <div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 bg-white/[0.015] text-[10px] uppercase tracking-[0.08em] text-zinc-500"><tr><th class="px-4 py-3 font-medium">Invoice</th><th class="px-4 py-3 font-medium">Due</th><th class="px-4 py-3 text-right font-medium">Outstanding</th><th class="px-4 py-3 font-medium">Allocate ₹</th></tr></thead><tbody class="divide-y divide-white/6">@for (invoice of outstandingInvoices(); track invoice.invoiceId) { <tr class="transition hover:bg-white/[0.025]"><td class="px-4 py-3"><p class="font-medium text-zinc-200">{{ invoice.invoiceNumber }}</p><p class="mt-0.5 text-[11px] text-zinc-500">{{ invoice.invoiceDate }}</p></td><td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{{ invoice.dueDate || '—' }}</td><td class="whitespace-nowrap px-4 py-3 text-right text-xs font-medium text-zinc-200">{{ formatPaise(invoice.outstandingPaise) }}</td><td class="w-40 px-4 py-3"><input class="ll-input w-full text-right" inputmode="decimal" min="0" [value]="allocationValue(invoice.invoiceId)" (input)="setAllocation(invoice.invoiceId, $any($event.target).value)" placeholder="0.00" /></td></tr> }</tbody></table></div> }
            </div>

            @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p> }
            <div class="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="text-xs text-[var(--ll-text-muted)]"><span>Allocated: <strong class="text-zinc-200">{{ formatRupees(allocationTotalPaise()) }}</strong></span><span class="mx-2 text-zinc-700">•</span><span>Unallocated: <strong [class.text-amber-300]="unallocatedPaise() > 0" [class.text-emerald-300]="unallocatedPaise() === 0">{{ formatRupees(unallocatedPaise()) }}</strong></span></div>
              <button type="submit" class="ll-primary-button" [disabled]="saving()">{{ saving() ? 'Posting…' : 'Create & post receipt' }}</button>
            </div>
          </form>
        </section>

        <aside class="space-y-4">
          <div class="rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 p-5">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Workflow</p>
            <ol class="mt-4 space-y-4 text-xs text-zinc-400">
              <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-300">1</span><span><strong class="text-zinc-200">Select customer</strong><br />Load issued invoices that still have receivable balance.</span></li>
              <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-300">2</span><span><strong class="text-zinc-200">Record collection</strong><br />Enter the actual amount received and the bank/cash account.</span></li>
              <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-300">3</span><span><strong class="text-zinc-200">Allocate</strong><br />Apply the collection to one or more outstanding invoices.</span></li>
              <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-300">4</span><span><strong class="text-zinc-200">Post</strong><br />The API creates a balanced receipt journal and records an audit event.</span></li>
            </ol>
          </div>
          <div class="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-5">
            <p class="text-xs font-semibold text-emerald-200">Accounting treatment</p>
            <div class="mt-3 rounded-xl border border-white/6 bg-black/10 p-3 font-mono text-[11px] leading-5 text-zinc-400"><div>Dr&nbsp; {{ selectedAccountLabel() || 'Bank / cash' }}</div><div>Cr&nbsp; Accounts receivable</div><div class="mt-2 text-emerald-300">{{ formatRupees(receiptPaise()) }}</div></div>
          </div>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    :host { display:block; }
    .ll-primary-button,.ll-secondary-button,.ll-input { font:inherit; }
    .ll-primary-button { display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:1px solid rgba(52,211,153,.35);border-radius:.75rem;background:rgba(16,185,129,.16);padding:.65rem .9rem;color:#fff;font-size:.75rem;font-weight:600;transition:background .15s,border-color .15s; }
    .ll-primary-button:hover:not(:disabled){background:rgba(16,185,129,.24);border-color:rgba(52,211,153,.5)}
    .ll-primary-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-secondary-button { display:inline-flex;align-items:center;justify-content:center;gap:.4rem;border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.03);padding:.55rem .75rem;color:#d4d4d8;font-size:.7rem;font-weight:600; }
    .ll-secondary-button:hover:not(:disabled){background:rgba(255,255,255,.06)} .ll-secondary-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-input { border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.035);padding:.62rem .75rem;color:#e4e4e7;font-size:.75rem;outline:none; }
    .ll-input:focus { border-color:rgba(110,231,183,.45);box-shadow:0 0 0 3px rgba(16,185,129,.08); }
    .ll-input::placeholder{color:#52525b} select.ll-input option{background:#18181b;color:#e4e4e7}
    .ll-label { display:block;color:#a1a1aa;font-size:.68rem;font-weight:600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReceiptsPageComponent {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);

  protected readonly customers = signal<Party[]>([]);
  protected readonly assetAccounts = signal<Account[]>([]);
  protected readonly outstandingInvoices = signal<OutstandingInvoice[]>([]);
  protected readonly partyId = signal('');
  protected readonly accountId = signal('');
  protected readonly receiptDate = signal(this.today());
  protected readonly amount = signal('');
  protected readonly reference = signal('');
  protected readonly notes = signal('');
  protected readonly allocations = signal<Allocation[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingInvoices = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly successMessage = signal('');

  constructor() { this.loadData(); }

  protected loadData(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('Select a company before recording a receipt.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const headers = this.headers();
    let completed = 0;
    const fail = (message: string) => { this.errorMessage.set(message); this.loading.set(false); };
    this.http.get<{ parties?: Party[] }>(`${API_BASE_URL}/companies/${companyId}/parties?type=customer&active=true`, { headers }).pipe(catchError(() => of({ parties: [] })), finalize(() => { completed++; if (completed === 2) this.loading.set(false); })).subscribe((response) => this.customers.set(response.parties ?? []));
    this.http.get<{ accounts?: Account[] }>(`${API_BASE_URL}/companies/${companyId}/accounts`, { headers }).pipe(catchError(() => of({ accounts: [] })), finalize(() => { completed++; if (completed === 2) this.loading.set(false); })).subscribe((response) => {
      const accounts = (response.accounts ?? []).filter((account) => account.is_active && account.account_type === 'asset');
      this.assetAccounts.set(accounts);
      if (!this.accountId() && accounts.length === 1) this.accountId.set(accounts[0].id);
    }, () => fail('Unable to load accounting accounts.'));
  }

  protected loadOutstanding(): void {
    const companyId = this.auth.selectedCompany()?.id;
    const partyId = this.partyId();
    this.allocations.set([]); this.successMessage.set(''); this.formError.set('');
    if (!companyId || !partyId) { this.outstandingInvoices.set([]); return; }
    this.loadingInvoices.set(true);
    this.http.get<{ invoices?: OutstandingInvoice[] }>(`${API_BASE_URL}/companies/${companyId}/sales/receipts/outstanding-invoices?partyId=${encodeURIComponent(partyId)}`, { headers: this.headers() }).pipe(finalize(() => this.loadingInvoices.set(false))).subscribe({
      next: (response) => this.outstandingInvoices.set(response.invoices ?? []),
      error: () => { this.outstandingInvoices.set([]); this.formError.set('Unable to load outstanding invoices for this customer.'); },
    });
  }

  protected setAllocation(invoiceId: string, value: string): void {
    const next = this.allocations().filter((item) => item.invoiceId !== invoiceId);
    if (value.trim()) next.push({ invoiceId, amount: value });
    this.allocations.set(next);
    this.formError.set('');
  }

  protected allocationValue(invoiceId: string): string { return this.allocations().find((item) => item.invoiceId === invoiceId)?.amount ?? ''; }

  protected allocationTotalPaise(): bigint { return this.allocations().reduce((total, item) => total + this.toPaise(item.amount), 0n); }
  protected receiptPaise(): bigint { return this.toPaise(this.amount()); }
  protected unallocatedPaise(): bigint { const remaining = this.receiptPaise() - this.allocationTotalPaise(); return remaining > 0n ? remaining : 0n; }

  protected selectedAccountLabel(): string { const account = this.assetAccounts().find((item) => item.id === this.accountId()); return account ? `${account.account_code} ${account.name}` : ''; }

  protected async saveReceipt(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(''); this.errorMessage.set(''); this.successMessage.set('');
    const companyId = this.auth.selectedCompany()?.id;
    const amountPaise = this.toPaise(this.amount());
    if (!companyId) { this.formError.set('Select a company before recording a receipt.'); return; }
    if (!this.partyId()) { this.formError.set('Select a customer.'); return; }
    if (!this.accountId()) { this.formError.set('Select a bank or cash asset account.'); return; }
    if (amountPaise <= 0n) { this.formError.set('Enter a positive receipt amount.'); return; }
    if (this.allocationTotalPaise() > amountPaise) { this.formError.set('Invoice allocations cannot exceed the receipt amount.'); return; }
    const allocations = this.allocations().map((item) => ({ invoiceId: item.invoiceId, allocatedPaise: this.toPaise(item.amount).toString() })).filter((item) => BigInt(item.allocatedPaise) > 0n);
    if (allocations.some((item) => this.invoiceOutstanding(item.invoiceId) < BigInt(item.allocatedPaise))) { this.formError.set('One or more allocations exceed the current invoice outstanding balance.'); return; }

    this.saving.set(true);
    this.http.post<{ receiptId: string; receiptNumber: string; amountPaise: string; allocatedPaise: string }>(`${API_BASE_URL}/companies/${companyId}/sales/receipts`, {
      receiptDate: this.receiptDate(), partyId: this.partyId(), accountId: this.accountId(), amountPaise: amountPaise.toString(), reference: this.reference().trim() || undefined, notes: this.notes().trim() || undefined, allocations,
    }, { headers: this.headers() }).subscribe({
      next: (created) => this.postReceipt(companyId, created.receiptId, created.receiptNumber),
      error: (error) => { this.saving.set(false); this.formError.set(this.apiError(error, 'Unable to create the receipt.')); },
    });
  }

  private postReceipt(companyId: string, receiptId: string, receiptNumber: string): void {
    this.http.post(`${API_BASE_URL}/companies/${companyId}/sales/receipts/${receiptId}/post`, {}, { headers: this.headers() }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.successMessage.set(`${receiptNumber} was created and posted successfully. The customer collection is now recorded in the ledger.`); this.resetForm(false); },
      error: (error) => { this.formError.set(`${receiptNumber} was created as a draft, but posting failed: ${this.apiError(error, 'Posting failed.')}`); },
    });
  }

  protected resetForm(showSuccess = true): void {
    this.partyId.set(''); this.receiptDate.set(this.today()); this.amount.set(''); this.reference.set(''); this.notes.set(''); this.allocations.set([]); this.outstandingInvoices.set([]); this.formError.set(''); if (showSuccess) this.successMessage.set('');
  }

  protected formatRupees(paise: bigint): string { return `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  protected formatPaise(value: string): string { return this.formatRupees(BigInt(value || '0')); }

  private invoiceOutstanding(invoiceId: string): bigint { return BigInt(this.outstandingInvoices().find((invoice) => invoice.invoiceId === invoiceId)?.outstandingPaise ?? '0'); }
  private toPaise(value: string): bigint { const normalized = value.trim().replace(/,/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return 0n; const [whole, fraction = ''] = normalized.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0'); }
  private today(): string { const date = new Date(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${date.getFullYear()}-${month}-${day}`; }
  private headers(): HttpHeaders { return new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` }); }
  private apiError(error: { error?: { message?: string } }, fallback: string): string { return error?.error?.message || fallback; }
}
