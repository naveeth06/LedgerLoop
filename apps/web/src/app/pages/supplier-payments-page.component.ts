import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAlertCircle, LucideCheckCircle2, LucideCoins, LucideRefreshCw, LucideSend } from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type Party = { id: string; party_code: string; name: string; party_type: 'customer' | 'supplier' | 'both'; is_active: boolean };
type Account = { id: string; account_code: string; name: string; account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'; is_active: boolean };
type PostingAccounts = { payableAccountId: string };
type OutstandingBill = { billId: string; billNumber: string; billDate: string; dueDate: string | null; totalPaise: string; allocatedPaise: string; outstandingPaise: string };
type Allocation = { billId: string; amount: string };

@Component({
  selector: 'll-supplier-payments-page',
  standalone: true,
  imports: [LucideAlertCircle, LucideCheckCircle2, LucideCoins, LucideRefreshCw, LucideSend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/10 text-amber-300"><svg lucideCoins [size]="19"></svg></span><div><p class="text-xs font-medium uppercase tracking-[0.16em] text-amber-300">Purchases</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Supplier Payments</h1></div></div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Record supplier payments, allocate them against received bills, and post the settlement to the ledger.</p>
        </div>
        <button type="button" class="ll-primary-button" [disabled]="saving() || !postingAccounts()" (click)="createAndPost()"><svg lucideSend [size]="15"></svg>{{ saving() ? 'Posting…' : 'Create & post payment' }}</button>
      </div>

      @if (errorMessage()) { <div class="mt-6 flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><svg lucideAlertCircle [size]="16"></svg><span>{{ errorMessage() }}</span></div> }
      @if (successMessage()) { <div class="mt-6 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status"><svg lucideCheckCircle2 [size]="17" class="mt-0.5 shrink-0"></svg><span>{{ successMessage() }}</span></div> }
      @if (!postingAccounts()) { <div class="mt-6 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><strong>Purchase posting setup required.</strong> Configure a supplier payable liability account before posting supplier payments.</div> }

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
        <section class="rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
          <div class="border-b border-white/8 px-5 py-4 sm:px-6"><p class="text-sm font-semibold text-white">Payment details</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">The API keeps the payment draft until the explicit post operation creates the journal.</p></div>
          <form class="space-y-5 p-5 sm:p-6" (submit)="$event.preventDefault(); createAndPost()">
            <div class="grid gap-4 sm:grid-cols-3">
              <label><span class="ll-label">Supplier</span><select class="ll-input mt-1.5 w-full" required [value]="partyId()" (change)="partyId.set($any($event.target).value); loadOutstanding()"><option value="">Select supplier</option>@for (party of suppliers(); track party.id) { <option [value]="party.id">{{ party.name }} · {{ party.party_code }}</option> }</select></label>
              <label><span class="ll-label">Payment date</span><input class="ll-input mt-1.5 w-full" type="date" required [value]="paymentDate()" (input)="paymentDate.set($any($event.target).value)" /></label>
              <label><span class="ll-label">Bank / cash account</span><select class="ll-input mt-1.5 w-full" required [value]="accountId()" (change)="accountId.set($any($event.target).value)"><option value="">Select asset account</option>@for (account of assetAccounts(); track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.name }}</option> }</select></label>
            </div>
            <div class="grid gap-4 sm:grid-cols-3">
              <label><span class="ll-label">Amount paid ₹</span><input class="ll-input mt-1.5 w-full" required inputmode="decimal" min="0.01" [value]="amount()" (input)="amount.set($any($event.target).value)" placeholder="25000.00" /></label>
              <label><span class="ll-label">Reference <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full" maxlength="160" [value]="reference()" (input)="reference.set($any($event.target).value)" placeholder="UTR / cheque / transaction ref" /></label>
              <label><span class="ll-label">Notes <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full" maxlength="5000" [value]="notes()" (input)="notes.set($any($event.target).value)" placeholder="Payment notes" /></label>
            </div>

            <div class="rounded-xl border border-white/8">
              <div class="flex flex-col gap-3 border-b border-white/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p class="text-xs font-semibold text-white">Bill allocation</p><p class="mt-0.5 text-[11px] text-zinc-500">Allocate all or part of the payment. Any remainder stays unallocated on the supplier account.</p></div><button type="button" class="ll-secondary-button" [disabled]="!partyId() || loadingBills()" (click)="loadOutstanding()"><svg lucideRefreshCw [size]="14" [class.animate-spin]="loadingBills()"></svg>Refresh bills</button></div>
              @if (!partyId()) { <div class="px-5 py-10 text-center text-xs text-zinc-500">Select a supplier to load received bills with outstanding balances.</div> }
              @else if (loadingBills()) { <div class="space-y-3 p-5">@for (row of [1,2,3]; track row) { <div class="h-12 animate-pulse rounded-lg bg-white/[0.035]"></div> }</div> }
              @else if (outstandingBills().length === 0) { <div class="px-5 py-10 text-center"><p class="text-sm font-medium text-zinc-300">No outstanding supplier bills</p><p class="mt-1 text-xs text-zinc-500">A payment can still be recorded as an unallocated supplier advance.</p></div> }
              @else { <div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 bg-white/[0.015] text-[10px] uppercase tracking-[0.08em] text-zinc-500"><tr><th class="px-4 py-3 font-medium">Bill</th><th class="px-4 py-3 font-medium">Due</th><th class="px-4 py-3 text-right font-medium">Outstanding</th><th class="px-4 py-3 font-medium">Allocate ₹</th></tr></thead><tbody class="divide-y divide-white/6">@for (bill of outstandingBills(); track bill.billId) { <tr class="transition hover:bg-white/[0.025]"><td class="px-4 py-3"><p class="font-medium text-zinc-200">{{ bill.billNumber }}</p><p class="mt-0.5 text-[11px] text-zinc-500">{{ bill.billDate }}</p></td><td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{{ bill.dueDate || '—' }}</td><td class="whitespace-nowrap px-4 py-3 text-right text-xs font-medium text-zinc-200">{{ formatPaise(bill.outstandingPaise) }}</td><td class="w-40 px-4 py-3"><input class="ll-input w-full text-right" inputmode="decimal" min="0" [value]="allocationValue(bill.billId)" (input)="setAllocation(bill.billId, $any($event.target).value)" placeholder="0.00" /></td></tr> }</tbody></table></div> }
            </div>
            @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p> }
            <div class="flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between"><div class="text-xs text-[var(--ll-text-muted)]"><span>Allocated: <strong class="text-zinc-200">{{ formatRupees(allocationTotalPaise()) }}</strong></span><span class="mx-2 text-zinc-700">•</span><span>Unallocated: <strong [class.text-amber-300]="hasUnallocated()" [class.text-emerald-300]="!hasUnallocated()">{{ formatRupees(unallocatedPaise()) }}</strong></span></div><button type="submit" class="ll-primary-button" [disabled]="saving() || !postingAccounts()">{{ saving() ? 'Posting…' : 'Create & post payment' }}</button></div>
          </form>
        </section>

        <aside class="space-y-4">
          <section class="rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 p-5"><p class="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Posting setup</p><p class="mt-1 text-[11px] text-zinc-500">Supplier payments credit the configured supplier payable account.</p><div class="mt-4"><span class="ll-label">Supplier payable account</span><div class="mt-1.5 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 text-xs text-zinc-300">{{ postingAccountLabel() || 'Not configured' }}</div></div></section>
          <section class="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-5"><p class="text-xs font-semibold text-amber-200">Accounting treatment</p><div class="mt-3 rounded-xl border border-white/6 bg-black/10 p-3 font-mono text-[11px] leading-5 text-zinc-400"><div>Dr&nbsp; {{ payableLabel() || 'Supplier payable' }}</div><div>Cr&nbsp; {{ selectedAccountLabel() || 'Bank / cash' }}</div><div class="mt-2 text-amber-300">{{ formatRupees(paymentPaise()) }}</div></div><p class="mt-3 text-xs leading-5 text-zinc-500">Allocation affects which bills are settled; the payment journal itself credits the bank/cash account and debits the configured payable account.</p></section>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    :host { display:block; }
    .ll-primary-button,.ll-secondary-button,.ll-input { font:inherit; }
    .ll-primary-button { display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:1px solid rgba(245,158,11,.35);border-radius:.75rem;background:rgba(245,158,11,.15);padding:.65rem .9rem;color:#fff;font-size:.75rem;font-weight:600;transition:background .15s,border-color .15s; }
    .ll-primary-button:hover:not(:disabled){background:rgba(245,158,11,.23);border-color:rgba(251,191,36,.5)} .ll-primary-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-secondary-button { display:inline-flex;align-items:center;justify-content:center;gap:.4rem;border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.03);padding:.55rem .75rem;color:#d4d4d8;font-size:.7rem;font-weight:600; }
    .ll-secondary-button:hover:not(:disabled){background:rgba(255,255,255,.06)} .ll-secondary-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-input { border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.035);padding:.62rem .75rem;color:#e4e4e7;font-size:.75rem;outline:none; }
    .ll-input:focus { border-color:rgba(251,191,36,.45);box-shadow:0 0 0 3px rgba(245,158,11,.08); }
    .ll-input::placeholder{color:#52525b} select.ll-input option{background:#18181b;color:#e4e4e7}
    .ll-label { display:block;color:#a1a1aa;font-size:.68rem;font-weight:600; }
  `],
})
export class SupplierPaymentsPageComponent {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  protected readonly suppliers = signal<Party[]>([]);
  protected readonly assetAccounts = signal<Account[]>([]);
  protected readonly outstandingBills = signal<OutstandingBill[]>([]);
  protected readonly postingAccounts = signal<PostingAccounts | null>(null);
  protected readonly partyId = signal('');
  protected readonly accountId = signal('');
  protected readonly paymentDate = signal(this.today());
  protected readonly amount = signal('');
  protected readonly reference = signal('');
  protected readonly notes = signal('');
  protected readonly allocations = signal<Allocation[]>([]);
  protected readonly loadingBills = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly successMessage = signal('');

  constructor() { this.loadData(); }

  protected loadData(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('Select a company before recording a supplier payment.'); return; }
    const base = `${API_BASE_URL}/companies/${companyId}`;
    this.errorMessage.set('');
    this.http.get<{ parties?: Party[] }>(`${base}/parties?type=supplier&active=true`).pipe(catchError(() => of({ parties: [] }))).subscribe((response) => this.suppliers.set(response.parties ?? []));
    this.http.get<{ accounts?: Account[] }>(`${base}/accounts`).pipe(catchError(() => of({ accounts: [] }))).subscribe((response) => {
      const accounts = response.accounts ?? [];
      const assets = accounts.filter((account) => account.is_active && account.account_type === 'asset');
      this.assetAccounts.set(assets);
      if (!this.accountId() && assets.length === 1) this.accountId.set(assets[0].id);
    });
    this.http.get<PostingAccounts>(`${base}/purchases/posting-accounts`).pipe(catchError(() => of(null))).subscribe((response) => this.postingAccounts.set(response));
  }

  protected loadOutstanding(): void {
    const companyId = this.auth.selectedCompany()?.id;
    const partyId = this.partyId();
    this.allocations.set([]);
    this.formError.set('');
    this.successMessage.set('');
    if (!companyId || !partyId) { this.outstandingBills.set([]); return; }
    this.loadingBills.set(true);
    this.http.get<{ bills?: OutstandingBill[] }>(`${API_BASE_URL}/companies/${companyId}/purchases/supplier-payments/outstanding-bills?partyId=${encodeURIComponent(partyId)}`).pipe(catchError(() => of({ bills: [] })), finalize(() => this.loadingBills.set(false))).subscribe((response) => this.outstandingBills.set(response.bills ?? []));
  }

  protected setAllocation(billId: string, amount: string): void {
    const next = this.allocations().filter((allocation) => allocation.billId !== billId);
    if (amount.trim()) next.push({ billId, amount });
    this.allocations.set(next);
    this.formError.set('');
  }

  protected allocationValue(billId: string): string { return this.allocations().find((allocation) => allocation.billId === billId)?.amount ?? ''; }

  protected createAndPost(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.formError.set('Select a company first.'); return; }
    const amountPaise = this.toPaise(this.amount());
    if (!this.partyId() || !this.paymentDate() || !this.accountId() || amountPaise === null) { this.formError.set('Supplier, payment date, bank/cash account, and a valid positive amount are required.'); return; }
    if (!this.postingAccounts()) { this.formError.set('Configure purchase posting accounts before posting a supplier payment.'); return; }
    const allocationPayload = this.allocations().map((allocation) => ({ billId: allocation.billId, allocatedPaise: this.toPaise(allocation.amount) ?? '0' })).filter((allocation) => allocation.allocatedPaise !== '0');
    const allocationTotal = allocationPayload.reduce((sum, allocation) => sum + BigInt(allocation.allocatedPaise), 0n);
    if (allocationTotal > BigInt(amountPaise)) { this.formError.set('Allocated amounts cannot exceed the payment amount.'); return; }
    this.saving.set(true); this.formError.set(''); this.errorMessage.set(''); this.successMessage.set('');
    const payload = { paymentDate: this.paymentDate(), partyId: this.partyId(), accountId: this.accountId(), amountPaise, reference: this.reference().trim() || undefined, notes: this.notes().trim() || undefined, allocations: allocationPayload };
    this.http.post<{ paymentId: string; paymentNumber: string }>(`${API_BASE_URL}/companies/${companyId}/purchases/supplier-payments`, payload).subscribe({
      next: (created) => this.http.post<{ paymentNumber: string; status: string; allocatedPaise: string; unallocatedPaise: string }>(`${API_BASE_URL}/companies/${companyId}/purchases/supplier-payments/${created.paymentId}/post`, {}).subscribe({
        next: (posted) => { this.successMessage.set(`${posted.paymentNumber} posted successfully. Allocated ${this.formatRupees(posted.allocatedPaise)}; unallocated ${this.formatRupees(posted.unallocatedPaise)}.`); this.resetForm(); this.loadData(); },
        error: (error) => this.formError.set(error?.error?.message || 'The supplier payment was created but could not be posted. Review purchase posting setup and try again.'),
        complete: () => this.saving.set(false),
      }),
      error: (error) => { this.formError.set(error?.error?.message || 'Supplier payment could not be created.'); this.saving.set(false); },
    });
  }

  protected resetForm(): void { this.partyId.set(''); this.amount.set(''); this.reference.set(''); this.notes.set(''); this.allocations.set([]); this.outstandingBills.set([]); this.paymentDate.set(this.today()); this.formError.set(''); }

  protected allocationTotalPaise(): string { return this.allocations().reduce((sum, allocation) => sum + BigInt(this.toPaise(allocation.amount) ?? '0'), 0n).toString(); }
  protected paymentPaise(): string { return this.toPaise(this.amount()) ?? '0'; }
  protected unallocatedPaise(): string { const amount = BigInt(this.paymentPaise()); const allocated = BigInt(this.allocationTotalPaise()); return (amount > allocated ? amount - allocated : 0n).toString(); }
  protected hasUnallocated(): boolean { return BigInt(this.unallocatedPaise()) > 0n; }
  protected selectedAccountLabel(): string { const account = this.assetAccounts().find((item) => item.id === this.accountId()); return account ? `${account.account_code} · ${account.name}` : ''; }
  protected payableLabel(): string { const id = this.postingAccounts()?.payableAccountId; return id ? 'Accounts payable' : ''; }
  protected postingAccountLabel(): string { return this.postingAccounts()?.payableAccountId ? 'Configured supplier payable' : ''; }
  protected formatPaise(paise: string): string { return this.formatRupees(paise); }
  protected formatRupees(paise: string): string { const value = BigInt(paise || '0'); return `₹${(Number(value) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  private toPaise(value: string): string | null { const normalized = value.trim().replace(/,/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) return null; const [rupees, fraction = ''] = normalized.split('.'); return `${BigInt(rupees) * 100n + BigInt((fraction + '00').slice(0, 2))}`; }
  private today(): string { return new Date().toISOString().slice(0, 10); }
}
