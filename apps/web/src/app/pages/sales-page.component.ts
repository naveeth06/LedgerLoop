import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LucideAlertCircle, LucideCheckCircle2, LucideFilePlus2, LucidePlus, LucideRefreshCw, LucideSearch, LucideSend, LucideTrash2 } from '@lucide/angular';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type Party = { id: string; party_code: string; name: string; party_type: 'customer' | 'supplier' | 'both'; gstin: string | null; is_active: boolean };
type Item = { id: string; item_code: string; name: string; item_type: 'goods' | 'service'; gst_rate_bps: number; selling_price_paise: string; is_active: boolean };
type Invoice = { id: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; partyId: string; partyCode: string; partyName: string; status: 'draft' | 'issued' | string; taxablePaise: string; cgstPaise: string; sgstPaise: string; igstPaise: string; totalPaise: string; createdAt: string };
type GstRegistration = { id: string; gstin: string; state_code: string; registration_type: string; is_primary: boolean; is_active: boolean };
type PostingAccounts = { receivableAccountId: string; salesAccountId: string; outputCgstAccountId: string; outputSgstAccountId: string; outputIgstAccountId: string };
type Account = { id: string; account_code: string; name: string; account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'; is_active: boolean };
type Line = { itemId: string; quantity: string; unitPrice: string; discount: string; gstRate: string };

@Component({
  selector: 'll-sales-page',
  standalone: true,
  imports: [LucideAlertCircle, LucideCheckCircle2, LucideFilePlus2, LucidePlus, LucideRefreshCw, LucideSearch, LucideSend, LucideTrash2],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideFilePlus2 [size]="19"></svg></span>
            <div><p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Sales</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Invoices</h1></div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Create customer invoices, review GST totals, and issue them into the accounting ledger.</p>
        </div>
        <button type="button" class="ll-primary-button" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>New invoice</button>
      </div>

      @if (errorMessage()) { <div class="mt-6 flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><svg lucideAlertCircle [size]="16"></svg><span>{{ errorMessage() }}</span></div> }
      @if (!primaryGst()) { <div class="mt-6 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><strong>GST setup required.</strong> Configure an active primary GST registration before creating a sales invoice.</div> }
      @if (primaryGst() && !postingAccounts()) { <div class="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><strong>Posting setup required.</strong> Configure the five sales posting accounts in Chart of Accounts before issuing invoices.</div> }

      <div class="mt-6 rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label class="relative block min-w-0 flex-1 sm:max-w-md"><span class="sr-only">Search invoices</span><svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg><input class="ll-input w-full pl-9" type="search" placeholder="Search invoice number or customer" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" /></label>
          <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh invoices" title="Refresh invoices" (click)="loadData()"><svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg></button>
        </div>
        @if (loading() && invoices().length === 0) { <div class="space-y-3 p-5">@for (row of [1,2,3,4,5]; track row) { <div class="h-14 animate-pulse rounded-xl bg-white/[0.035]"></div> }</div> }
        @else if (filteredInvoices().length === 0) { <div class="px-6 py-16 text-center"><div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500"><svg lucideFilePlus2 [size]="20"></svg></div><h2 class="mt-4 text-sm font-semibold text-white">{{ invoices().length ? 'No matching invoices' : 'No invoices yet' }}</h2><p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">{{ invoices().length ? 'Try a different search.' : 'Create the first customer invoice to start the sales workflow.' }}</p></div> }
        @else { <div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><tr><th class="px-5 py-3.5 font-medium">Invoice</th><th class="px-5 py-3.5 font-medium">Customer</th><th class="px-5 py-3.5 font-medium">Date</th><th class="px-5 py-3.5 font-medium">Due</th><th class="px-5 py-3.5 font-medium">Total</th><th class="px-5 py-3.5 font-medium">Status</th><th class="px-5 py-3.5 font-medium">Action</th></tr></thead><tbody class="divide-y divide-white/6">@for (invoice of filteredInvoices(); track invoice.id) { <tr class="transition hover:bg-white/[0.025]"><td class="px-5 py-4"><p class="font-medium text-white">{{ invoice.invoiceNumber }}</p><p class="mt-1 text-[11px] text-zinc-500">Taxable {{ formatPaise(invoice.taxablePaise) }}</p></td><td class="px-5 py-4"><p class="font-medium text-zinc-200">{{ invoice.partyName }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ invoice.partyCode }}</p></td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ invoice.invoiceDate }}</td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ invoice.dueDate || '—' }}</td><td class="whitespace-nowrap px-5 py-4 text-xs font-medium text-zinc-200">{{ formatPaise(invoice.totalPaise) }}</td><td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-issued]="invoice.status === 'issued'" [class.ll-status-draft]="invoice.status === 'draft'">{{ invoice.status === 'issued' ? 'Issued' : 'Draft' }}</span></td><td class="whitespace-nowrap px-5 py-4">@if (invoice.status === 'draft') { <button type="button" class="ll-action-button" [disabled]="issuingId() === invoice.id || !postingAccounts()" (click)="issueInvoice(invoice)"><svg lucideSend [size]="14"></svg>{{ issuingId() === invoice.id ? 'Issuing…' : 'Issue' }}</button> } @else { <span class="flex items-center gap-1.5 text-xs text-emerald-300"><svg lucideCheckCircle2 [size]="14"></svg>Posted</span> }</td></tr> }</tbody></table></div><div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">Showing {{ filteredInvoices().length }} of {{ invoices().length }} invoices</div> }
      </div>

      @if (createFormOpen()) { <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeCreateForm()"><section class="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="new-invoice-title" (click)="$event.stopPropagation()">
        <div class="flex items-start justify-between gap-4"><div><p class="text-xs font-medium uppercase tracking-[0.14em] text-violet-300">Sales document</p><h2 id="new-invoice-title" class="mt-1 text-lg font-semibold text-white">Create invoice</h2></div><button type="button" class="ll-icon-button" aria-label="Close" (click)="closeCreateForm()">×</button></div>
        @if (!primaryGst()) { <p class="mt-5 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">An active primary GST registration is required by the sales API.</p> }
        <form class="mt-5 space-y-5" (submit)="createInvoice($event)">
          <div class="grid gap-4 sm:grid-cols-3"><label><span class="ll-label">Customer</span><select class="ll-input mt-1.5 w-full" required [value]="partyId()" (change)="partyId.set($any($event.target).value)"><option value="">Select customer</option>@for (party of customers(); track party.id) { <option [value]="party.id">{{ party.name }} · {{ party.party_code }}</option> }</select></label><label><span class="ll-label">Invoice date</span><input class="ll-input mt-1.5 w-full" type="date" required [value]="invoiceDate()" (input)="invoiceDate.set($any($event.target).value)" /></label><label><span class="ll-label">Due date</span><input class="ll-input mt-1.5 w-full" type="date" [value]="dueDate()" (input)="dueDate.set($any($event.target).value)" /></label></div>
          <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Place of supply state code</span><input class="ll-input mt-1.5 w-full font-mono" maxlength="2" inputmode="numeric" [value]="placeOfSupply()" (input)="placeOfSupply.set($any($event.target).value)" placeholder="33" /></label><label><span class="ll-label">Notes <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full" maxlength="4000" [value]="notes()" (input)="notes.set($any($event.target).value)" placeholder="Payment terms or customer notes" /></label></div>
          <div class="rounded-xl border border-white/8"><div class="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><p class="text-xs font-semibold text-white">Invoice lines</p><p class="mt-0.5 text-[11px] text-zinc-500">Prices are entered in rupees; the API stores integer paise.</p></div><button type="button" class="ll-secondary-button" (click)="addLine()"><svg lucidePlus [size]="14"></svg>Add line</button></div>
            @for (line of lines(); track $index; let i = $index) { <div class="grid gap-3 border-b border-white/6 p-4 last:border-b-0 sm:grid-cols-[1.8fr_.8fr_1fr_1fr_1fr_auto]"><label><span class="ll-label">Item</span><select class="ll-input mt-1.5 w-full" [value]="line.itemId" (change)="updateLine(i, 'itemId', $any($event.target).value)"><option value="">Select item</option>@for (item of items(); track item.id) { <option [value]="item.id">{{ item.name }} · {{ item.item_code }}</option> }</select></label><label><span class="ll-label">Qty</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="line.quantity" (input)="updateLine(i, 'quantity', $any($event.target).value)" /></label><label><span class="ll-label">Unit price ₹</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="line.unitPrice" (input)="updateLine(i, 'unitPrice', $any($event.target).value)" /></label><label><span class="ll-label">Discount ₹</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="line.discount" (input)="updateLine(i, 'discount', $any($event.target).value)" /></label><label><span class="ll-label">GST %</span><input class="ll-input mt-1.5 w-full" type="number" min="0" max="100" step="0.01" [value]="line.gstRate" (input)="updateLine(i, 'gstRate', $any($event.target).value)" /></label><button type="button" class="ll-icon-button mt-5" aria-label="Remove line" [disabled]="lines().length === 1" (click)="removeLine(i)"><svg lucideTrash2 [size]="14"></svg></button></div> }
          </div>
          @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p> }
          <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-secondary-button" (click)="closeCreateForm()">Cancel</button><button type="submit" class="ll-primary-button" [disabled]="saving() || !primaryGst()">{{ saving() ? 'Creating…' : 'Create draft invoice' }}</button></div>
        </form>
      </section></div> }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .ll-primary-button,.ll-secondary-button,.ll-icon-button,.ll-input,.ll-action-button { font:inherit; }
    .ll-primary-button { display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:1px solid rgba(167,139,250,.35);border-radius:.75rem;background:rgba(124,58,237,.18);padding:.65rem .9rem;color:#fff;font-size:.75rem;font-weight:600; }
    .ll-primary-button:hover:not(:disabled){background:rgba(124,58,237,.28)} .ll-primary-button:disabled,.ll-action-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-secondary-button { display:inline-flex;align-items:center;justify-content:center;gap:.4rem;border:1px solid rgba(255,255,255,.1);border-radius:.75rem;background:rgba(255,255,255,.03);padding:.65rem .9rem;color:#d4d4d8;font-size:.75rem;font-weight:600; }
    .ll-icon-button { display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border:1px solid rgba(255,255,255,.08);border-radius:.7rem;background:rgba(255,255,255,.025);color:#a1a1aa; }
    .ll-input { border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.035);padding:.65rem .75rem;color:#e4e4e7;font-size:.75rem;outline:none; }
    .ll-input:focus { border-color:rgba(167,139,250,.5);box-shadow:0 0 0 3px rgba(124,58,237,.1); } .ll-input option{background:#18181b;color:#fff}
    .ll-label { display:block;color:#a1a1aa;font-size:.7rem;font-weight:600; }
    .ll-status { display:inline-flex;border:1px solid rgba(245,158,11,.16);border-radius:999px;background:rgba(245,158,11,.08);padding:.25rem .55rem;font-size:.68rem;color:#fcd34d; } .ll-status-issued{border-color:rgba(74,222,128,.16);background:rgba(34,197,94,.08);color:#86efac}.ll-status-draft{color:#fcd34d}
    .ll-action-button { display:inline-flex;align-items:center;gap:.4rem;border:1px solid rgba(167,139,250,.2);border-radius:.65rem;background:rgba(124,58,237,.12);padding:.45rem .65rem;color:#ddd6fe;font-size:.7rem;font-weight:600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly invoices = signal<Invoice[]>([]);
  protected readonly customers = signal<Party[]>([]);
  protected readonly items = signal<Item[]>([]);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly primaryGst = signal<GstRegistration | null>(null);
  protected readonly postingAccounts = signal<PostingAccounts | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly issuingId = signal('');
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly searchTerm = signal('');
  protected readonly createFormOpen = signal(false);
  protected readonly partyId = signal('');
  protected readonly invoiceDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly dueDate = signal('');
  protected readonly placeOfSupply = signal('');
  protected readonly notes = signal('');
  protected readonly lines = signal<Line[]>([{ itemId: '', quantity: '1', unitPrice: '0', discount: '0', gstRate: '0' }]);

  constructor() { this.loadData(); }

  protected filteredInvoices(): Invoice[] { const q = this.searchTerm().trim().toLowerCase(); if (!q) return this.invoices(); return this.invoices().filter((invoice) => `${invoice.invoiceNumber} ${invoice.partyName} ${invoice.partyCode}`.toLowerCase().includes(q)); }

  protected loadData(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('Select a company before loading sales.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const headers = this.headers();
    forkJoin({
      invoices: this.http.get<{ invoices: Invoice[] }>(`${API_BASE_URL}/companies/${companyId}/sales/invoices`, { headers }).pipe(catchError(() => of({ invoices: [] }))),
      parties: this.http.get<{ parties: Party[] }>(`${API_BASE_URL}/companies/${companyId}/parties?type=customer&active=true`, { headers }).pipe(catchError(() => of({ parties: [] }))),
      items: this.http.get<{ items: Item[] }>(`${API_BASE_URL}/companies/${companyId}/items?active=true`, { headers }).pipe(catchError(() => of({ items: [] }))),
      accounts: this.http.get<{ accounts: Account[] }>(`${API_BASE_URL}/companies/${companyId}/accounts`, { headers }).pipe(catchError(() => of({ accounts: [] }))),
      registrations: this.http.get<{ registrations: GstRegistration[] }>(`${API_BASE_URL}/companies/${companyId}/gst-registrations`, { headers }).pipe(catchError(() => of({ registrations: [] }))),
      posting: this.http.get<{ postingAccounts: PostingAccounts | null }>(`${API_BASE_URL}/companies/${companyId}/sales/posting-accounts`, { headers }).pipe(catchError(() => of({ postingAccounts: null }))),
    }).pipe(finalize(() => this.loading.set(false))).subscribe((result) => {
      this.invoices.set(result.invoices.invoices ?? []); this.customers.set(result.parties.parties ?? []); this.items.set(result.items.items ?? []); this.accounts.set(result.accounts.accounts ?? []);
      this.primaryGst.set((result.registrations.registrations ?? []).find((registration) => registration.is_primary && registration.is_active) ?? null); this.postingAccounts.set(result.posting.postingAccounts);
      if (!this.placeOfSupply() && this.primaryGst()) this.placeOfSupply.set(this.primaryGst()!.state_code);
    });
  }

  protected openCreateForm(): void { this.formError.set(''); this.resetForm(); this.createFormOpen.set(true); }
  protected closeCreateForm(): void { if (!this.saving()) this.createFormOpen.set(false); }
  protected resetForm(): void { this.partyId.set(''); this.invoiceDate.set(new Date().toISOString().slice(0,10)); this.dueDate.set(''); this.notes.set(''); this.formError.set(''); this.lines.set([{ itemId: '', quantity: '1', unitPrice: '0', discount: '0', gstRate: '0' }]); if (this.primaryGst()) this.placeOfSupply.set(this.primaryGst()!.state_code); }
  protected addLine(): void { this.lines.update((lines) => [...lines, { itemId: '', quantity: '1', unitPrice: '0', discount: '0', gstRate: '0' }]); }
  protected removeLine(index: number): void { if (this.lines().length === 1) return; this.lines.update((lines) => lines.filter((_, i) => i !== index)); }
  protected updateLine(index: number, field: keyof Line, value: string): void { this.lines.update((lines) => lines.map((line, i) => i === index ? { ...line, [field]: value } : line)); }

  protected createInvoice(event: Event): void {
    event.preventDefault(); this.formError.set('');
    if (!this.primaryGst()) { this.formError.set('Configure an active primary GST registration first.'); return; }
    if (!this.partyId()) { this.formError.set('Select a customer.'); return; }
    if (!/^\d{2}$/.test(this.placeOfSupply())) { this.formError.set('Place of supply must be a two-digit state code.'); return; }
    const bodyLines: Array<Record<string, unknown>> = [];
    for (const line of this.lines()) {
      if (!line.itemId) { this.formError.set('Select an item for every invoice line.'); return; }
      const quantity = Number(line.quantity); const unitPrice = this.toPaise(line.unitPrice); const discount = this.toPaise(line.discount); const gst = Number(line.gstRate);
      if (!Number.isFinite(quantity) || quantity <= 0 || unitPrice === null || discount === null || !Number.isFinite(gst) || gst < 0 || gst > 100) { this.formError.set('Check quantity, prices, discount, and GST on every line.'); return; }
      bodyLines.push({ itemId: line.itemId, quantity: line.quantity, unitPricePaise: unitPrice, discountPaise: discount, gstRateBps: Math.round(gst * 100) });
    }
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) { this.formError.set('Select a company first.'); return; }
    this.saving.set(true);
    this.http.post(`${API_BASE_URL}/companies/${companyId}/sales/invoices`, { documentDate: this.invoiceDate(), dueDate: this.dueDate() || undefined, partyId: this.partyId(), placeOfSupplyStateCode: this.placeOfSupply(), notes: this.notes().trim() || undefined, lines: bodyLines }, { headers: this.headers() }).pipe(catchError((error) => { this.formError.set(error?.error?.message || 'Unable to create invoice.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe((result) => { if (!result) return; this.closeCreateForm(); this.loadData(); });
  }

  protected issueInvoice(invoice: Invoice): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId || !this.postingAccounts()) return;
    this.issuingId.set(invoice.id); this.errorMessage.set('');
    this.http.post(`${API_BASE_URL}/companies/${companyId}/sales/invoices/${invoice.id}/issue`, {}, { headers: this.headers() }).pipe(catchError((error) => { this.errorMessage.set(error?.error?.message || 'Unable to issue invoice.'); return of(null); }), finalize(() => this.issuingId.set(''))).subscribe((result) => { if (result) this.loadData(); });
  }

  protected formatPaise(value: string): string { const paise = Number(value); return Number.isFinite(paise) ? `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'; }
  private toPaise(value: string): string | null { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 9e15) return null; return Math.round(number * 100).toString(); }
  private headers(): HttpHeaders { const token = this.auth.getAccessToken(); return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders(); }
}
