import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideChevronDown, LucideEdit3, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideWalletCards } from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
type AccountType = typeof ACCOUNT_TYPES[number];
type AccountFormMode = 'create' | 'edit';

type LedgerAccount = {
  id: string;
  company_id: string;
  account_code: string;
  name: string;
  account_type: AccountType;
  parent_account_id: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
};

@Component({
  selector: 'll-accounts-page',
  standalone: true,
  imports: [LucideChevronDown, LucideEdit3, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideWalletCards],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideWalletCards [size]="19"></svg></span>
            <div><p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Accounting</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Chart of Accounts</h1></div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Manage the ledger accounts used by this company. System accounts remain protected while user-defined accounts can be maintained by authorized roles.</p>
        </div>
        <button type="button" class="ll-primary-button shrink-0" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>New account</button>
      </div>

      @if (errorMessage()) {
        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><span>{{ errorMessage() }}</span><button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-100 hover:bg-white/5" (click)="loadAccounts()">Retry</button></div>
      }

      <div class="mt-6 rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label class="relative block min-w-0 flex-1 sm:max-w-md"><span class="sr-only">Search accounts</span><svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg><input class="ll-input w-full pl-9" type="search" placeholder="Search by code or account name" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" /></label>
          <div class="flex items-center gap-2">
            <div class="relative"><select class="ll-input appearance-none pr-9 text-xs" [value]="typeFilter()" (change)="setTypeFilter($any($event.target).value)"><option value="all">All account types</option>@for (type of accountTypes; track type) { <option [value]="type">{{ typeLabel(type) }}</option> }</select><svg class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideChevronDown [size]="14"></svg></div>
            <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh accounts" title="Refresh accounts" (click)="loadAccounts()"><svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg></button>
          </div>
        </div>

        @if (loading() && accounts().length === 0) {
          <div class="space-y-3 p-5">@for (row of [1,2,3,4,5,6]; track row) { <div class="h-12 animate-pulse rounded-xl bg-white/[0.035]"></div> }</div>
        } @else if (filteredAccounts().length === 0) {
          <div class="px-6 py-16 text-center"><div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500"><svg lucideWalletCards [size]="20"></svg></div><h2 class="mt-4 text-sm font-semibold text-white">{{ accounts().length ? 'No matching accounts' : 'No accounts yet' }}</h2><p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">{{ accounts().length ? 'Try a different search or account type.' : 'Create the first user-defined ledger account for this company.' }}</p>@if (!accounts().length) { <button type="button" class="ll-primary-button mt-5" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>New account</button> }</div>
        } @else {
          <div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><tr><th class="px-5 py-3.5 font-medium">Code</th><th class="px-5 py-3.5 font-medium">Account</th><th class="px-5 py-3.5 font-medium">Type</th><th class="px-5 py-3.5 font-medium">Parent</th><th class="px-5 py-3.5 font-medium">Status</th><th class="px-5 py-3.5 font-medium">Kind</th><th class="px-5 py-3.5 text-right font-medium">Actions</th></tr></thead>
            <tbody class="divide-y divide-white/6">@for (account of filteredAccounts(); track account.id) { <tr class="transition hover:bg-white/[0.025]"><td class="whitespace-nowrap px-5 py-4 font-mono text-xs text-zinc-300">{{ account.account_code }}</td><td class="min-w-56 px-5 py-4"><p class="font-medium text-white">{{ account.name }}</p>@if (account.description) { <p class="mt-1 line-clamp-1 text-xs text-[var(--ll-text-muted)]">{{ account.description }}</p> }</td><td class="whitespace-nowrap px-5 py-4"><span class="ll-account-type" [attr.data-type]="account.account_type">{{ typeLabel(account.account_type) }}</span></td><td class="whitespace-nowrap px-5 py-4 text-xs text-[var(--ll-text-muted)]">{{ parentName(account.parent_account_id) }}</td><td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!account.is_active">{{ account.is_active ? 'Active' : 'Inactive' }}</span></td><td class="whitespace-nowrap px-5 py-4 text-xs text-[var(--ll-text-muted)]">{{ account.is_system ? 'System' : 'Custom' }}</td><td class="whitespace-nowrap px-5 py-4"><div class="flex justify-end gap-1">@if (!account.is_system) { <button type="button" class="ll-icon-button" [attr.aria-label]="'Edit ' + account.name" title="Edit account" (click)="openEditForm(account)"><svg lucideEdit3 [size]="15"></svg></button><button type="button" class="ll-icon-button" [disabled]="saving()" [attr.aria-label]="account.is_active ? 'Deactivate ' + account.name : 'Activate ' + account.name" [title]="account.is_active ? 'Deactivate account' : 'Activate account'" (click)="toggleStatus(account)"><svg lucideToggleLeft [size]="16"></svg></button> } @else { <span class="px-2 text-[11px] text-zinc-600">Protected</span> }</div></td></tr> }</tbody>
          </table></div>
          <div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">Showing {{ filteredAccounts().length }} of {{ accounts().length }} accounts</div>
        }
      </div>
    </section>

    @if (formOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeForm()">
        <section class="w-full max-w-lg rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl" role="dialog" aria-modal="true" [attr.aria-labelledby]="formMode() === 'create' ? 'new-account-title' : 'edit-account-title'" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4"><div><p class="text-xs font-medium uppercase tracking-[0.14em] text-violet-300">Ledger setup</p><h2 [id]="formMode() === 'create' ? 'new-account-title' : 'edit-account-title'" class="mt-1 text-lg font-semibold text-white">{{ formMode() === 'create' ? 'Create account' : 'Edit account' }}</h2></div><button type="button" class="ll-icon-button" aria-label="Close" (click)="closeForm()">×</button></div>
          <form class="mt-5 space-y-4" (submit)="saveForm($event)">
            <div class="grid gap-4 sm:grid-cols-2"><label class="block"><span class="ll-label">Account code</span><input class="ll-input mt-1.5 w-full opacity-60" [disabled]="formMode() === 'create'" [readOnly]="formMode() === 'edit'" required maxlength="32" [value]="formAccountCode()" placeholder="Generated automatically" /><span class="ll-help">Automatically generated for this company and account type.</span></label><label class="block"><span class="ll-label">Account type</span><select class="ll-input mt-1.5 w-full" [disabled]="formMode() === 'edit'" [value]="formAccountType()" (change)="onAccountTypeChange($any($event.target).value)">@for (type of accountTypes; track type) { <option [value]="type">{{ typeLabel(type) }}</option> }</select></label></div>
            <label class="block"><span class="ll-label">Account name</span><input class="ll-input mt-1.5 w-full" maxlength="160" required [value]="formName()" (input)="formName.set($any($event.target).value)" placeholder="e.g. Software subscriptions" /></label>
            <label class="block"><span class="ll-label">Parent account <span class="font-normal text-zinc-600">(optional)</span></span><select class="ll-input mt-1.5 w-full" [value]="formParentAccountId()" (change)="formParentAccountId.set($any($event.target).value)"><option value="">No parent</option>@for (account of editableParentAccounts(); track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.name }}</option> }</select></label>
            <label class="block"><span class="ll-label">Description <span class="font-normal text-zinc-600">(optional)</span></span><textarea class="ll-input mt-1.5 min-h-24 w-full resize-y" maxlength="2000" [value]="formDescription()" (input)="formDescription.set($any($event.target).value)" placeholder="What this account is used for"></textarea></label>
            @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p> }
            <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-secondary-button" (click)="closeForm()">Cancel</button><button type="submit" class="ll-primary-button" [disabled]="saving()">{{ saving() ? 'Saving…' : (formMode() === 'create' ? 'Create account' : 'Save changes') }}</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display:block; }
    .ll-primary-button,.ll-secondary-button,.ll-icon-button,.ll-input { font:inherit; }
    .ll-primary-button { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; border:1px solid rgba(167,139,250,.35); border-radius:.75rem; background:rgba(139,92,246,.16); padding:.65rem .9rem; color:#f5f3ff; font-size:.75rem; font-weight:600; transition:.15s ease; }
    .ll-primary-button:hover:not(:disabled) { background:rgba(139,92,246,.24); border-color:rgba(167,139,250,.5); }
    .ll-primary-button:disabled { cursor:not-allowed; opacity:.55; }
    .ll-secondary-button { border:1px solid rgba(255,255,255,.09); border-radius:.75rem; background:rgba(255,255,255,.025); padding:.65rem .9rem; color:#d4d4d8; font-size:.75rem; font-weight:600; }
    .ll-secondary-button:hover { background:rgba(255,255,255,.05); color:white; }
    .ll-icon-button { display:inline-flex; height:2.25rem; width:2.25rem; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.08); border-radius:.7rem; background:rgba(255,255,255,.025); color:#a1a1aa; transition:.15s ease; }
    .ll-icon-button:hover:not(:disabled) { background:rgba(255,255,255,.06); color:white; }
    .ll-icon-button:disabled { opacity:.5; }
    .ll-input { border:1px solid rgba(255,255,255,.09); border-radius:.75rem; background:rgba(255,255,255,.025); padding:.65rem .75rem; color:#f4f4f5; outline:none; font-size:.75rem; }
    .ll-input::placeholder { color:#52525b; }
    .ll-input:focus { border-color:rgba(167,139,250,.45); box-shadow:0 0 0 3px rgba(139,92,246,.08); }
    select.ll-input option { background:#18181b; color:#f4f4f5; }
    .ll-label { color:#a1a1aa; font-size:.7rem; font-weight:600; }
    .ll-account-type,.ll-status { display:inline-flex; align-items:center; border-radius:999px; padding:.3rem .55rem; font-size:.68rem; font-weight:600; }
    .ll-account-type { background:rgba(255,255,255,.05); color:#d4d4d8; }
    .ll-account-type[data-type="asset"] { color:#a5b4fc; background:rgba(99,102,241,.1); }
    .ll-account-type[data-type="liability"] { color:#fda4af; background:rgba(244,63,94,.1); }
    .ll-account-type[data-type="equity"] { color:#c4b5fd; background:rgba(139,92,246,.1); }
    .ll-account-type[data-type="income"] { color:#86efac; background:rgba(34,197,94,.1); }
    .ll-account-type[data-type="expense"] { color:#fdba74; background:rgba(249,115,22,.1); }
    .ll-status { color:#86efac; background:rgba(34,197,94,.09); }
    .ll-status-inactive { color:#a1a1aa; background:rgba(161,161,170,.08); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly accountTypes = ACCOUNT_TYPES;
  protected readonly accounts = signal<LedgerAccount[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly typeFilter = signal<'all' | AccountType>('all');
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formOpen = signal(false);
  protected readonly formMode = signal<AccountFormMode>('create');
  protected readonly editingAccountId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly formAccountCode = signal('');
  protected readonly formName = signal('');
  protected readonly formAccountType = signal<AccountType>('expense');
  protected readonly formParentAccountId = signal('');
  protected readonly formDescription = signal('');

  constructor() { this.loadAccounts(); }

  protected filteredAccounts(): LedgerAccount[] {
    const query = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();
    return this.accounts().filter((account) => {
      const matchesQuery = !query || account.account_code.toLowerCase().includes(query) || account.name.toLowerCase().includes(query) || (account.description ?? '').toLowerCase().includes(query);
      return matchesQuery && (type === 'all' || account.account_type === type);
    });
  }

  protected editableParentAccounts(): LedgerAccount[] {
    const currentId = this.editingAccountId();
    return this.accounts().filter((account) => account.id !== currentId);
  }

  protected setTypeFilter(value: string): void { this.typeFilter.set(value === 'all' || ACCOUNT_TYPES.includes(value as AccountType) ? value as 'all' | AccountType : 'all'); }
  protected typeLabel(type: AccountType): string { return type.charAt(0).toUpperCase() + type.slice(1); }
  protected parentName(parentId: string | null): string { if (!parentId) return '—'; const parent = this.accounts().find((account) => account.id === parentId); return parent ? `${parent.account_code} · ${parent.name}` : '—'; }

  protected loadAccounts(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('No company is selected.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` });
    this.http.get<{ accounts?: LedgerAccount[] }>(`${API_BASE_URL}/companies/${companyId}/accounts`, { headers }).pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(() => { this.errorMessage.set('Unable to load the chart of accounts. Please try again.'); return of({ accounts: [] }); }),
      finalize(() => this.loading.set(false)),
    ).subscribe((response) => this.accounts.set(response.accounts ?? []));
  }

  protected openCreateForm(): void {
    this.formMode.set('create'); this.editingAccountId.set(null); this.formError.set(''); this.formAccountType.set('expense'); this.formAccountCode.set(this.nextAccountCode('expense')); this.formName.set(''); this.formParentAccountId.set(''); this.formDescription.set(''); this.formOpen.set(true);
  }

  protected openEditForm(account: LedgerAccount): void {
    if (account.is_system) return;
    this.formMode.set('edit'); this.editingAccountId.set(account.id); this.formError.set(''); this.formAccountCode.set(account.account_code); this.formName.set(account.name); this.formAccountType.set(account.account_type); this.formParentAccountId.set(account.parent_account_id ?? ''); this.formDescription.set(account.description ?? ''); this.formOpen.set(true);
  }

  protected onAccountTypeChange(value: string): void {
    if (this.formMode() === 'edit') return;
    const type = ACCOUNT_TYPES.includes(value as AccountType) ? value as AccountType : 'expense';
    this.formAccountType.set(type);
    this.formAccountCode.set(this.nextAccountCode(type));
  }

  protected closeForm(): void { if (!this.saving()) this.formOpen.set(false); }

  protected saveForm(event: Event): void {
    event.preventDefault();
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.formError.set('No company is selected.'); return; }
    const name = this.formName().trim();
    if (!name) { this.formError.set('Account name is required.'); return; }
    const accountCode = this.formAccountCode().trim();
    if (!accountCode) { this.formError.set('A ledger account code could not be generated. Please refresh and try again.'); return; }
    this.saving.set(true); this.formError.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` });
    const body = { name, parentAccountId: this.formParentAccountId() || null, ...(this.formDescription().trim() ? { description: this.formDescription().trim() } : {}) };
    if (this.formMode() === 'create') {
      const createBody = { accountCode, ...body, accountType: this.formAccountType() };
      this.http.post<{ account: LedgerAccount }>(`${API_BASE_URL}/companies/${companyId}/accounts`, createBody, { headers }).pipe(
        takeUntilDestroyed(this.destroyRef), catchError((error: unknown) => { this.formError.set(this.errorFromResponse(error, 'create')); return of(null); }), finalize(() => this.saving.set(false)),
      ).subscribe((response) => { if (!response) return; this.accounts.update((accounts) => [...accounts, response.account].sort((a, b) => a.account_code.localeCompare(b.account_code))); this.formOpen.set(false); });
      return;
    }
    const accountId = this.editingAccountId();
    if (!accountId) { this.saving.set(false); this.formError.set('The account to edit is no longer available.'); return; }
    this.http.patch<{ account: LedgerAccount }>(`${API_BASE_URL}/companies/${companyId}/accounts/${accountId}`, body, { headers }).pipe(
      takeUntilDestroyed(this.destroyRef), catchError((error: unknown) => { this.formError.set(this.errorFromResponse(error, 'update')); return of(null); }), finalize(() => this.saving.set(false)),
    ).subscribe((response) => { if (!response) return; this.accounts.update((accounts) => accounts.map((account) => account.id === response.account.id ? response.account : account)); this.formOpen.set(false); });
  }

  protected toggleStatus(account: LedgerAccount): void {
    if (account.is_system || this.saving()) return;
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('No company is selected.'); return; }
    this.saving.set(true); this.errorMessage.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` });
    this.http.patch<{ account: LedgerAccount }>(`${API_BASE_URL}/companies/${companyId}/accounts/${account.id}/status`, { isActive: !account.is_active }, { headers }).pipe(
      takeUntilDestroyed(this.destroyRef), catchError((error: unknown) => { this.errorMessage.set(this.errorFromResponse(error, 'status')); return of(null); }), finalize(() => this.saving.set(false)),
    ).subscribe((response) => { if (response) this.accounts.update((accounts) => accounts.map((item) => item.id === response.account.id ? response.account : item)); });
  }

  private nextAccountCode(type: AccountType): string {
    const starts: Record<AccountType, number> = { asset: 1300, liability: 2200, equity: 3100, income: 4100, expense: 5100 };
    const used = new Set(this.accounts().map((account) => account.account_code.toUpperCase()));
    let candidate = starts[type];
    while (used.has(String(candidate))) candidate += 10;
    return String(candidate);
  }

  private errorFromResponse(error: unknown, action: 'create' | 'update' | 'status'): string {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status?: unknown }).status;
      if (status === 409) return action === 'create' ? 'The automatically generated account code is already in use. Please refresh and try again.' : 'The account update conflicts with an existing account.';
      if (status === 400) return 'Please check the account details and try again.';
      if (status === 403) return 'You do not have permission to change this account.';
    }
    return action === 'status' ? 'Unable to change the account status. Please try again.' : `Unable to ${action} the account. Please try again.`;
  }
}
