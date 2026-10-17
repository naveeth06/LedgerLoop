import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideEdit3, LucideMail, LucidePhone, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideUsers } from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';
import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type PartyType = 'customer' | 'supplier' | 'both';
type Party = { id: string; company_id: string; party_code: string; name: string; party_type: PartyType; gstin: string | null; email: string | null; phone: string | null; billing_address: Record<string, unknown>; credit_limit_paise: string; is_active: boolean; email_reminders_enabled: boolean; created_at: string; updated_at: string };
const PARTY_TYPES: PartyType[] = ['customer', 'supplier', 'both'];

@Component({
  selector: 'll-parties-page',
  standalone: true,
  imports: [LucideEdit3, LucideMail, LucidePhone, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideUsers],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideUsers [size]="19"></svg></span><div><p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Masters</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Customers & Suppliers</h1></div></div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Maintain the parties used by sales, purchases, receipts, payments, and overdue reminders for this company.</p>
        </div>
        <button type="button" class="ll-button-primary" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>New party</button>
      </header>

      @if (errorMessage()) { <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><span>{{ errorMessage() }}</span><button type="button" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-white/5" (click)="loadParties()">Retry</button></div> }

      <section class="mt-6 overflow-hidden rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label class="relative block flex-1 sm:max-w-md"><span class="sr-only">Search customers and suppliers</span><svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg><input class="ll-input w-full pl-9" type="search" placeholder="Search parties, GSTIN or email" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" /></label>
          <div class="flex flex-wrap items-center gap-2"><select class="ll-input text-xs" aria-label="Filter by party type" [value]="typeFilter()" (change)="typeFilter.set($any($event.target).value); loadParties()"><option value="all">All types</option>@for (type of partyTypes; track type) { <option [value]="type">{{ typeLabel(type) }}</option> }</select><select class="ll-input text-xs" aria-label="Filter by status" [value]="activeFilter()" (change)="activeFilter.set($any($event.target).value); loadParties()"><option value="all">All status</option><option value="true">Active</option><option value="false">Inactive</option></select><button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh parties" title="Refresh" (click)="loadParties()"><svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg></button></div>
        </div>

        @if (loading() && parties().length === 0) { <div class="space-y-3 p-5">@for (row of [1,2,3,4,5,6]; track row) { <div class="h-14 animate-pulse rounded-xl bg-white/[0.035]"></div> }</div> }
        @else if (filteredParties().length === 0) { <div class="px-6 py-16 text-center"><div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500"><svg lucideUsers [size]="20"></svg></div><h2 class="mt-4 text-sm font-semibold text-white">{{ parties().length ? 'No matching parties' : 'No parties yet' }}</h2><p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">Add a customer or supplier to use them in sales and purchase workflows.</p><button type="button" class="ll-button-primary mt-5" (click)="openCreateForm()"><svg lucidePlus [size]="15"></svg>Create party</button></div> }
        @else { <div class="overflow-x-auto"><table class="min-w-[920px] w-full text-left text-sm"><thead><tr class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><th class="px-5 py-3.5 font-medium">Party</th><th class="px-5 py-3.5 font-medium">Type</th><th class="px-5 py-3.5 font-medium">GSTIN</th><th class="px-5 py-3.5 font-medium">Contact</th><th class="px-5 py-3.5 font-medium">Credit limit</th><th class="px-5 py-3.5 font-medium">Status</th><th class="px-5 py-3.5 text-right font-medium">Actions</th></tr></thead><tbody class="divide-y divide-white/6">@for (party of filteredParties(); track party.id) { <tr class="transition-colors hover:bg-white/[0.025]"><td class="px-5 py-4"><p class="font-medium text-white">{{ party.name }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ party.party_code }}</p></td><td class="px-5 py-4"><span class="ll-party-type">{{ typeLabel(party.party_type) }}</span></td><td class="px-5 py-4 font-mono text-xs text-[var(--ll-text-muted)]">{{ party.gstin || '—' }}</td><td class="px-5 py-4">@if (party.email) { <div class="flex items-center gap-1.5 text-xs text-zinc-300"><svg lucideMail [size]="13"></svg>{{ party.email }}</div> } @if (party.phone) { <div class="mt-1 flex items-center gap-1.5 text-xs text-zinc-500"><svg lucidePhone [size]="13"></svg>{{ party.phone }}</div> }</td><td class="px-5 py-4 text-xs text-zinc-300">{{ formatPaise(party.credit_limit_paise) }}</td><td class="px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!party.is_active">{{ party.is_active ? 'Active' : 'Inactive' }}</span></td><td class="px-5 py-4"><div class="flex justify-end gap-2"><button type="button" class="ll-action-button" (click)="openEditForm(party)"><svg lucideEdit3 [size]="14"></svg>Edit</button><button type="button" class="ll-action-button" [disabled]="statusSavingId() === party.id" (click)="toggleStatus(party)"><svg lucideToggleLeft [size]="14"></svg>{{ statusSavingId() === party.id ? 'Saving…' : (party.is_active ? 'Deactivate' : 'Activate') }}</button></div></td></tr> }</tbody></table></div><div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">Showing {{ filteredParties().length }} of {{ parties().length }} parties</div> }
      </section>
    </section>

    @if (formOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeForm()">
        <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="party-form-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4"><div><p class="ll-eyebrow">Party master</p><h2 id="party-form-title" class="mt-1 text-lg font-semibold text-white">{{ editingId() ? 'Edit party' : 'Create party' }}</h2></div><button type="button" class="ll-icon-button" aria-label="Close form" title="Close" (click)="closeForm()">×</button></div>
          <form class="mt-6 space-y-5" (submit)="saveParty($event)">
            @if (!editingId()) { <label><span class="ll-label">Party code</span><input class="ll-input mt-1.5 w-full" maxlength="32" required [value]="formPartyCode()" (input)="formPartyCode.set($any($event.target).value)" placeholder="e.g. CUST-001" /><span class="ll-help">Unique code for this customer or supplier. A suggested code is filled automatically.</span></label> }
            @else { <div><span class="ll-label">Party code</span><p class="mt-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 font-mono text-sm text-zinc-300">{{ formPartyCode() }}</p></div> }
            <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Name</span><input class="ll-input mt-1.5 w-full" maxlength="200" required [value]="formName()" (input)="formName.set($any($event.target).value)" placeholder="e.g. Acme Supplies" /></label><label><span class="ll-label">Party type</span><select class="ll-input mt-1.5 w-full" [value]="formPartyType()" (change)="onPartyTypeChange($any($event.target).value)">@for (type of partyTypes; track type) { <option [value]="type">{{ typeLabel(type) }}</option> }</select></label></div>
            <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">GSTIN <span class="font-normal text-zinc-500">(optional)</span></span><input class="ll-input mt-1.5 w-full font-mono uppercase" maxlength="15" [value]="formGstin()" (input)="formGstin.set($any($event.target).value.toUpperCase())" placeholder="e.g. 33AAAAA0000A1Z5" /></label><label><span class="ll-label">Credit limit (₹)</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="formCreditLimit()" (input)="formCreditLimit.set($any($event.target).value)" placeholder="0.00" /></label></div>
            <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Email <span class="font-normal text-zinc-500">(optional)</span></span><input class="ll-input mt-1.5 w-full" type="email" autocomplete="email" [value]="formEmail()" (input)="formEmail.set($any($event.target).value)" placeholder="billing@company.com" /></label><label><span class="ll-label">Phone <span class="font-normal text-zinc-500">(optional)</span></span><input class="ll-input mt-1.5 w-full" type="tel" autocomplete="tel" [value]="formPhone()" (input)="formPhone.set($any($event.target).value)" placeholder="e.g. +91 98765 43210" /></label></div>
            @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200" role="alert">{{ formError() }}</p> }
            <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-button-secondary" (click)="closeForm()">Cancel</button><button type="submit" class="ll-button-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : (editingId() ? 'Save changes' : 'Create party') }}</button></div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display:block; }
    .ll-input { min-height:2.5rem; border:1px solid var(--ll-border); border-radius:.75rem; background:color-mix(in srgb,var(--ll-text) 2.5%,transparent); color:var(--ll-text); padding:.625rem .75rem; outline:none; font-size:.75rem; transition:border-color 180ms ease,background-color 180ms ease,box-shadow 180ms ease; }
    .ll-input::placeholder { color:#6f6f7b; opacity:1; }
    .ll-input:focus { border-color:color-mix(in srgb,var(--ll-primary-soft) 45%,transparent); background:color-mix(in srgb,var(--ll-text) 4%,transparent); box-shadow:0 0 0 3px color-mix(in srgb,var(--ll-primary) 9%,transparent); }
    select.ll-input option { background:var(--ll-surface-elevated); color:var(--ll-text); }
    .ll-label { display:block; color:var(--ll-text-muted); font-size:.7rem; font-weight:650; }
    .ll-help { display:block; margin-top:.35rem; color:var(--ll-text-muted); font-size:.65rem; line-height:1rem; }
    .ll-party-type,.ll-status { display:inline-flex; align-items:center; border-radius:999px; padding:.3rem .55rem; font-size:.66rem; font-weight:650; }
    .ll-party-type { color:var(--ll-text-muted); background:color-mix(in srgb,var(--ll-text) 5%,transparent); }
    .ll-status { color:#86efac; background:rgba(34,197,94,.1); }
    .ll-status-inactive { color:#fda4af; background:rgba(244,63,94,.1); }
    .ll-action-button { display:inline-flex; align-items:center; gap:.35rem; min-height:2.25rem; border:1px solid color-mix(in srgb,var(--ll-primary-soft) 20%,transparent); border-radius:.65rem; background:color-mix(in srgb,var(--ll-primary) 9%,transparent); padding:.4rem .6rem; color:var(--ll-primary-soft); font-size:.68rem; font-weight:650; transition:background-color 180ms ease,border-color 180ms ease; }
    .ll-action-button:hover:not(:disabled) { border-color:color-mix(in srgb,var(--ll-primary-soft) 30%,transparent); background:color-mix(in srgb,var(--ll-primary) 14%,transparent); }
    .ll-action-button:disabled { opacity:.5; }
  `],
})
export class PartiesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly partyTypes = PARTY_TYPES;
  protected readonly parties = signal<Party[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly typeFilter = signal<'all' | PartyType>('all');
  protected readonly activeFilter = signal<'all' | 'true' | 'false'>('true');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly statusSavingId = signal<string | null>(null);

  protected readonly formPartyCode = signal('');
  protected readonly formName = signal('');
  protected readonly formPartyType = signal<PartyType>('customer');
  protected readonly formGstin = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPhone = signal('');
  protected readonly formCreditLimit = signal('0.00');

  protected filteredParties = () => {
    const q = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();
    return this.parties().filter((party) => (type === 'all' || party.party_type === type || party.party_type === 'both') && (!q || [party.party_code, party.name, party.gstin, party.email, party.phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))));
  };

  constructor() { this.loadParties(); }

  protected loadParties(): void {
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) { this.errorMessage.set('Select a company workspace before managing parties.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params: Record<string, string> = { active: this.activeFilter() };
    if (this.typeFilter() !== 'all') params['type'] = this.typeFilter();
    this.http.get<{ parties: Party[] }>(`${API_BASE_URL}/companies/${companyId}/parties`, { headers, params }).pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError((error) => { this.errorMessage.set(error?.error?.message || 'Unable to load customers and suppliers.'); return of({ parties: [] }); }),
      finalize(() => this.loading.set(false)),
    ).subscribe((response) => this.parties.set(response.parties ?? []));
  }

  protected openCreateForm(): void { this.resetForm(); this.formOpen.set(true); }
  protected openEditForm(party: Party): void {
    this.editingId.set(party.id); this.formPartyCode.set(party.party_code); this.formName.set(party.name); this.formPartyType.set(party.party_type); this.formGstin.set(party.gstin ?? ''); this.formEmail.set(party.email ?? ''); this.formPhone.set(party.phone ?? ''); this.formCreditLimit.set((Number(party.credit_limit_paise || 0) / 100).toFixed(2)); this.formError.set(''); this.formOpen.set(true);
  }
  protected closeForm(): void { if (!this.saving()) this.formOpen.set(false); }

  protected onPartyTypeChange(value: string): void {
    const type = PARTY_TYPES.includes(value as PartyType) ? value as PartyType : 'customer';
    this.formPartyType.set(type);
    if (!this.editingId() && /^(CUST|SUP)-\d{3}$/.test(this.formPartyCode())) this.formPartyCode.set(this.suggestedCode(type));
  }

  protected saveParty(event: Event): void {
    event.preventDefault();
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) { this.formError.set('Select a company workspace before creating a party.'); return; }
    const name = this.formName().trim();
    const partyCode = this.formPartyCode().trim();
    const credit = this.toPaise(this.formCreditLimit());
    if (!partyCode) { this.formError.set('Party code is required.'); return; }
    if (!name || credit === null) { this.formError.set('Enter a party name and a valid non-negative credit limit.'); return; }
    const body = { name, partyType: this.formPartyType(), gstin: this.formGstin().trim() || undefined, email: this.formEmail().trim() || undefined, phone: this.formPhone().trim() || undefined, creditLimitPaise: credit };
    this.saving.set(true); this.formError.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const request = this.editingId()
      ? this.http.patch<{ party: Party }>(`${API_BASE_URL}/companies/${companyId}/parties/${this.editingId()}`, body, { headers })
      : this.http.post<{ party: Party }>(`${API_BASE_URL}/companies/${companyId}/parties`, { ...body, partyCode }, { headers });
    request.pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError((error) => { this.formError.set(this.readApiError(error, 'Unable to save the party. Check the details and try again.')); return of(null); }),
      finalize(() => this.saving.set(false)),
    ).subscribe((response) => {
      if (!response?.party) return;
      this.parties.update((items) => items.some((party) => party.id === response.party.id) ? items.map((party) => party.id === response.party.id ? response.party : party) : [response.party, ...items]);
      this.formOpen.set(false);
    });
  }

  protected toggleStatus(party: Party): void {
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) return;
    this.statusSavingId.set(party.id);
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.patch<{ id: string; is_active: boolean }>(`${API_BASE_URL}/companies/${companyId}/parties/${party.id}/status`, { isActive: !party.is_active }, { headers }).pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError((error) => { this.errorMessage.set(this.readApiError(error, 'Unable to update party status.')); return of(null); }),
      finalize(() => this.statusSavingId.set(null)),
    ).subscribe((response) => { if (response) this.parties.update((items) => items.map((item) => item.id === party.id ? { ...item, is_active: response.is_active } : item)); });
  }

  protected typeLabel(type: PartyType): string { return type === 'both' ? 'Customer & Supplier' : type.charAt(0).toUpperCase() + type.slice(1); }
  protected resetForm(): void { this.editingId.set(null); this.formPartyCode.set(this.suggestedCode('customer')); this.formName.set(''); this.formPartyType.set('customer'); this.formGstin.set(''); this.formEmail.set(''); this.formPhone.set(''); this.formCreditLimit.set('0.00'); this.formError.set(''); }
  protected toPaise(value: string): string | null { const normalized = value.trim(); if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null; const [whole, fraction = ''] = normalized.split('.'); return `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '') || '0'; }
  protected formatPaise(value: string): string { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value || 0) / 100); }

  private suggestedCode(type: PartyType): string {
    const prefix = type === 'supplier' ? 'SUP' : 'CUST';
    const existing = new Set(this.parties().map((party) => party.party_code.toUpperCase()));
    for (let index = 1; index <= 999; index += 1) { const candidate = `${prefix}-${String(index).padStart(3, '0')}`; if (!existing.has(candidate)) return candidate; }
    return `${prefix}-${Date.now().toString().slice(-8)}`;
  }

  private readApiError(error: unknown, fallback: string): string {
    const message = typeof error === 'object' && error !== null && 'error' in error ? (error as { error?: { message?: unknown } }).error?.message : undefined;
    if (typeof message === 'string' && message.trim()) return message;
    return fallback;
  }
}
