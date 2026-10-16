import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideChevronDown,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideWalletCards,
} from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
type AccountType = typeof ACCOUNT_TYPES[number];

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
  imports: [LucideChevronDown, LucidePlus, LucideRefreshCw, LucideSearch, LucideWalletCards],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              <svg lucideWalletCards [size]="19"></svg>
            </span>
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Accounting</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Chart of Accounts</h1>
            </div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">
            Manage the ledger accounts used by this company. System accounts remain available to accounting workflows and user-created accounts can be added by authorized roles.
          </p>
        </div>

        <button type="button" class="ll-primary-button shrink-0" (click)="openCreateForm()">
          <svg lucidePlus [size]="16"></svg>
          New account
        </button>
      </div>

      @if (errorMessage()) {
        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          <span>{{ errorMessage() }}</span>
          <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-100 hover:bg-white/5" (click)="loadAccounts()">Retry</button>
        </div>
      }

      <div class="mt-6 rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label class="relative block min-w-0 flex-1 sm:max-w-md">
            <span class="sr-only">Search accounts</span>
            <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg>
            <input
              class="ll-input w-full pl-9"
              type="search"
              placeholder="Search by code or account name"
              [value]="searchTerm()"
              (input)="setSearch($any($event.target).value)"
            />
          </label>

          <div class="flex items-center gap-2">
            <div class="relative">
              <select class="ll-input appearance-none pr-9 text-xs" [value]="typeFilter()" (change)="setTypeFilter($any($event.target).value)">
                <option value="all">All account types</option>
                @for (type of accountTypes; track type) {
                  <option [value]="type">{{ typeLabel(type) }}</option>
                }
              </select>
              <svg class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideChevronDown [size]="14"></svg>
            </div>
            <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh accounts" title="Refresh accounts" (click)="loadAccounts()">
              <svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg>
            </button>
          </div>
        </div>

        @if (loading() && accounts().length === 0) {
          <div class="space-y-3 p-5" aria-label="Loading accounts">
            @for (row of [1, 2, 3, 4, 5, 6]; track row) {
              <div class="h-12 animate-pulse rounded-xl bg-white/[0.035]"></div>
            }
          </div>
        } @else if (filteredAccounts().length === 0) {
          <div class="px-6 py-16 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500">
              <svg lucideWalletCards [size]="20"></svg>
            </div>
            <h2 class="mt-4 text-sm font-semibold text-white">{{ accounts().length ? 'No matching accounts' : 'No accounts yet' }}</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">
              {{ accounts().length ? 'Try a different search or account type.' : 'Create the first user-defined ledger account for this company.' }}
            </p>
            @if (!accounts().length) {
              <button type="button" class="ll-primary-button mt-5" (click)="openCreateForm()">
                <svg lucidePlus [size]="16"></svg>
                New account
              </button>
            }
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th class="px-5 py-3.5 font-medium">Code</th>
                  <th class="px-5 py-3.5 font-medium">Account</th>
                  <th class="px-5 py-3.5 font-medium">Type</th>
                  <th class="px-5 py-3.5 font-medium">Parent</th>
                  <th class="px-5 py-3.5 font-medium">Status</th>
                  <th class="px-5 py-3.5 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/6">
                @for (account of filteredAccounts(); track account.id) {
                  <tr class="transition hover:bg-white/[0.025]">
                    <td class="whitespace-nowrap px-5 py-4 font-mono text-xs text-zinc-300">{{ account.account_code }}</td>
                    <td class="min-w-56 px-5 py-4">
                      <p class="font-medium text-white">{{ account.name }}</p>
                      @if (account.description) {
                        <p class="mt-1 line-clamp-1 text-xs text-[var(--ll-text-muted)]">{{ account.description }}</p>
                      }
                    </td>
                    <td class="whitespace-nowrap px-5 py-4">
                      <span class="ll-account-type" [attr.data-type]="account.account_type">{{ typeLabel(account.account_type) }}</span>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-xs text-[var(--ll-text-muted)]">{{ parentName(account.parent_account_id) }}</td>
                    <td class="whitespace-nowrap px-5 py-4">
                      <span class="ll-status" [class.ll-status-inactive]="!account.is_active">{{ account.is_active ? 'Active' : 'Inactive' }}</span>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-xs text-[var(--ll-text-muted)]">{{ account.is_system ? 'System' : 'Custom' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">
            Showing {{ filteredAccounts().length }} of {{ accounts().length }} accounts
          </div>
        }
      </div>
    </section>

    @if (createFormOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeCreateForm()">
        <section class="w-full max-w-lg rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="new-account-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-violet-300">Ledger setup</p>
              <h2 id="new-account-title" class="mt-1 text-lg font-semibold text-white">Create account</h2>
            </div>
            <button type="button" class="ll-icon-button" aria-label="Close" (click)="closeCreateForm()">×</button>
          </div>

          <form class="mt-5 space-y-4" (submit)="createAccount($event)">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="ll-label">Account code</span>
                <input class="ll-input mt-1.5 w-full" name="accountCode" maxlength="32" required [value]="formAccountCode()" (input)="formAccountCode.set($any($event.target).value)" placeholder="e.g. 6100" />
              </label>
              <label class="block">
                <span class="ll-label">Account type</span>
                <select class="ll-input mt-1.5 w-full" name="accountType" [value]="formAccountType()" (change)="formAccountType.set($any($event.target).value)">
                  @for (type of accountTypes; track type) {
                    <option [value]="type">{{ typeLabel(type) }}</option>
                  }
                </select>
              </label>
            </div>

            <label class="block">
              <span class="ll-label">Account name</span>
              <input class="ll-input mt-1.5 w-full" name="name" maxlength="160" required [value]="formName()" (input)="formName.set($any($event.target).value)" placeholder="e.g. Software subscriptions" />
            </label>

            <label class="block">
              <span class="ll-label">Parent account <span class="font-normal text-zinc-600">(optional)</span></span>
              <select class="ll-input mt-1.5 w-full" name="parentAccountId" [value]="formParentAccountId()" (change)="formParentAccountId.set($any($event.target).value)">
                <option value="">No parent</option>
                @for (account of accounts(); track account.id) {
                  <option [value]="account.id">{{ account.account_code }} · {{ account.name }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="ll-label">Description <span class="font-normal text-zinc-600">(optional)</span></span>
              <textarea class="ll-input mt-1.5 min-h-24 w-full resize-y" name="description" maxlength="2000" [value]="formDescription()" (input)="formDescription.set($any($event.target).value)" placeholder="What this account is used for"></textarea>
            </label>

            @if (formError()) {
              <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p>
            }

            <div class="flex justify-end gap-2 border-t border-white/8 pt-4">
              <button type="button" class="ll-secondary-button" (click)="closeCreateForm()">Cancel</button>
              <button type="submit" class="ll-primary-button" [disabled]="saving()">
                @if (saving()) { Creating... } @else { Create account }
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .ll-primary-button, .ll-secondary-button, .ll-icon-button, .ll-input { font: inherit; }
    .ll-primary-button { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border: 1px solid rgba(167,139,250,.35); border-radius: .75rem; background: rgba(139,92,246,.16); padding: .65rem .9rem; color: #f5f3ff; font-size: .75rem; font-weight: 600; transition: .15s ease; }
    .ll-primary-button:hover:not(:disabled) { background: rgba(139,92,246,.24); border-color: rgba(167,139,250,.5); }
    .ll-primary-button:disabled { cursor: not-allowed; opacity: .55; }
    .ll-secondary-button { border: 1px solid rgba(255,255,255,.09); border-radius: .75rem; background: rgba(255,255,255,.025); padding: .65rem .9rem; color: #d4d4d8; font-size: .75rem; font-weight: 600; }
    .ll-secondary-button:hover { background: rgba(255,255,255,.05); color: white; }
    .ll-icon-button { display: inline-flex; height: 2.25rem; width: 2.25rem; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.08); border-radius: .7rem; background: rgba(255,255,255,.025); color: #a1a1aa; transition: .15s ease; }
    .ll-icon-button:hover:not(:disabled) { background: rgba(255,255,255,.06); color: white; }
    .ll-icon-button:disabled { opacity: .5; }
    .ll-input { border: 1px solid rgba(255,255,255,.09); border-radius: .75rem; background: rgba(255,255,255,.025); padding: .65rem .75rem; color: #f4f4f5; outline: none; font-size: .75rem; }
    .ll-input::placeholder { color: #52525b; }
    .ll-input:focus { border-color: rgba(167,139,250,.45); box-shadow: 0 0 0 3px rgba(139,92,246,.08); }
    select.ll-input option { background: #18181b; color: #f4f4f5; }
    .ll-label { color: #a1a1aa; font-size: .7rem; font-weight: 600; }
    .ll-account-type, .ll-status { display: inline-flex; align-items: center; border-radius: 999px; padding: .3rem .55rem; font-size: .68rem; font-weight: 600; }
    .ll-account-type { background: rgba(255,255,255,.05); color: #d4d4d8; }
    .ll-account-type[data-type="asset"] { color: #a5b4fc; background: rgba(99,102,241,.1); }
    .ll-account-type[data-type="liability"] { color: #fda4af; background: rgba(244,63,94,.1); }
    .ll-account-type[data-type="equity"] { color: #c4b5fd; background: rgba(139,92,246,.1); }
    .ll-account-type[data-type="income"] { color: #86efac; background: rgba(34,197,94,.1); }
    .ll-account-type[data-type="expense"] { color: #fdba74; background: rgba(249,115,22,.1); }
    .ll-status { color: #86efac; background: rgba(34,197,94,.09); }
    .ll-status-inactive { color: #a1a1aa; background: rgba(161,161,170,.08); }
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
  protected readonly createFormOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly formAccountCode = signal('');
  protected readonly formName = signal('');
  protected readonly formAccountType = signal<AccountType>('expense');
  protected readonly formParentAccountId = signal('');
  protected readonly formDescription = signal('');

  constructor() {
    this.loadAccounts();
  }

  protected filteredAccounts(): LedgerAccount[] {
    const query = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();
    return this.accounts().filter((account) => {
      const matchesQuery = !query || account.account_code.toLowerCase().includes(query) || account.name.toLowerCase().includes(query) || (account.description ?? '').toLowerCase().includes(query);
      const matchesType = type === 'all' || account.account_type === type;
      return matchesQuery && matchesType;
    });
  }

  protected setSearch(value: string): void { this.searchTerm.set(value); }

  protected setTypeFilter(value: string): void {
    this.typeFilter.set(value === 'all' || ACCOUNT_TYPES.includes(value as AccountType) ? value as 'all' | AccountType : 'all');
  }

  protected typeLabel(type: AccountType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  protected parentName(parentId: string | null): string {
    if (!parentId) return '—';
    const parent = this.accounts().find((account) => account.id === parentId);
    return parent ? `${parent.account_code} · ${parent.name}` : '—';
  }

  protected loadAccounts(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) {
      this.errorMessage.set('No company is selected.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` });
    this.http.get<{ accounts: LedgerAccount[] }>(`${API_BASE_URL}/companies/${companyId}/accounts`, { headers })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.errorMessage.set('Unable to load the chart of accounts. Please try again.');
          return of({ accounts: [] });
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((response) => this.accounts.set(response.accounts));
  }

  protected openCreateForm(): void {
    this.formError.set('');
    this.formAccountCode.set('');
    this.formName.set('');
    this.formAccountType.set('expense');
    this.formParentAccountId.set('');
    this.formDescription.set('');
    this.createFormOpen.set(true);
  }

  protected closeCreateForm(): void {
    if (!this.saving()) this.createFormOpen.set(false);
  }

  protected createAccount(event: Event): void {
    event.preventDefault();
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) {
      this.formError.set('No company is selected.');
      return;
    }

    const accountCode = this.formAccountCode().trim();
    const name = this.formName().trim();
    if (!accountCode || !name) {
      this.formError.set('Account code and account name are required.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getAccessToken()}` });
    const body = {
      accountCode,
      name,
      accountType: this.formAccountType(),
      ...(this.formParentAccountId() ? { parentAccountId: this.formParentAccountId() } : {}),
      ...(this.formDescription().trim() ? { description: this.formDescription().trim() } : {}),
    };

    this.http.post<{ account: LedgerAccount }>(`${API_BASE_URL}/companies/${companyId}/accounts`, body, { headers })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((error: unknown) => {
          const message = this.errorFromResponse(error);
          this.formError.set(message);
          return of(null);
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((response) => {
        if (!response) return;
        this.accounts.update((accounts) => [...accounts, response.account].sort((a, b) => a.account_code.localeCompare(b.account_code)));
        this.createFormOpen.set(false);
      });
  }

  private errorFromResponse(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status?: unknown }).status;
      if (status === 409) return 'An account with this code already exists.';
      if (status === 400) return 'Please check the account details and try again.';
      if (status === 403) return 'You do not have permission to create accounts.';
    }
    return 'Unable to create the account. Please try again.';
  }
}
