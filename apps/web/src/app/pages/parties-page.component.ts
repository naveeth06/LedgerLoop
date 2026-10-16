import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideMail,
  LucidePhone,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideToggleLeft,
  LucideUsers,
} from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type PartyType = 'customer' | 'supplier' | 'both';

type Party = {
  id: string;
  company_id: string;
  party_code: string;
  name: string;
  party_type: PartyType;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  billing_address: Record<string, unknown>;
  credit_limit_paise: string;
  is_active: boolean;
  email_reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
};

const PARTY_TYPES: PartyType[] = ['customer', 'supplier', 'both'];

@Component({
  selector: 'll-parties-page',
  standalone: true,
  imports: [
    LucideMail,
    LucidePhone,
    LucidePlus,
    LucideRefreshCw,
    LucideSearch,
    LucideToggleLeft,
    LucideUsers,
  ],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              <svg lucideUsers [size]="19"></svg>
            </span>
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Masters</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Customers & Suppliers</h1>
            </div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">
            Maintain the parties used by sales, purchases, receipts, payments, and overdue reminders for this company.
          </p>
        </div>

        <button type="button" class="ll-primary-button shrink-0" (click)="openCreateForm()">
          <svg lucidePlus [size]="16"></svg>
          New party
        </button>
      </div>

      @if (errorMessage()) {
        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          <span>{{ errorMessage() }}</span>
          <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-100 hover:bg-white/5" (click)="loadParties()">Retry</button>
        </div>
      }

      <div class="mt-6 rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label class="relative block min-w-0 flex-1 sm:max-w-md">
            <span class="sr-only">Search parties</span>
            <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg>
            <input
              class="ll-input w-full pl-9"
              type="search"
              placeholder="Search by code, name, GSTIN or email"
              [value]="searchTerm()"
              (input)="searchTerm.set($any($event.target).value)"
            />
          </label>

          <div class="flex items-center gap-2">
            <select class="ll-input text-xs" [value]="typeFilter()" (change)="typeFilter.set($any($event.target).value)">
              <option value="all">All parties</option>
              @for (type of partyTypes; track type) {
                <option [value]="type">{{ typeLabel(type) }}</option>
              }
            </select>
            <select class="ll-input text-xs" [value]="activeFilter()" (change)="activeFilter.set($any($event.target).value)">
              <option value="all">All status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh parties" title="Refresh parties" (click)="loadParties()">
              <svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg>
            </button>
          </div>
        </div>

        @if (loading() && parties().length === 0) {
          <div class="space-y-3 p-5" aria-label="Loading parties">
            @for (row of [1, 2, 3, 4, 5, 6]; track row) {
              <div class="h-14 animate-pulse rounded-xl bg-white/[0.035]"></div>
            }
          </div>
        } @else if (filteredParties().length === 0) {
          <div class="px-6 py-16 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500">
              <svg lucideUsers [size]="20"></svg>
            </div>
            <h2 class="mt-4 text-sm font-semibold text-white">{{ parties().length ? 'No matching parties' : 'No parties yet' }}</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">
              {{ parties().length ? 'Try a different search or filter.' : 'Create a customer, supplier, or combined party to start using sales and purchase workflows.' }}
            </p>
            @if (!parties().length) {
              <button type="button" class="ll-primary-button mt-5" (click)="openCreateForm()">
                <svg lucidePlus [size]="16"></svg>
                New party
              </button>
            }
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th class="px-5 py-3.5 font-medium">Party</th>
                  <th class="px-5 py-3.5 font-medium">Type</th>
                  <th class="px-5 py-3.5 font-medium">GSTIN</th>
                  <th class="px-5 py-3.5 font-medium">Contact</th>
                  <th class="px-5 py-3.5 font-medium">Credit limit</th>
                  <th class="px-5 py-3.5 font-medium">Status</th>
                  <th class="px-5 py-3.5 font-medium">Reminders</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/6">
                @for (party of filteredParties(); track party.id) {
                  <tr class="transition hover:bg-white/[0.025]">
                    <td class="min-w-56 px-5 py-4">
                      <p class="font-medium text-white">{{ party.name }}</p>
                      <p class="mt-1 font-mono text-[11px] text-zinc-500">{{ party.party_code }}</p>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4">
                      <span class="ll-party-type" [attr.data-type]="party.party_type">{{ typeLabel(party.party_type) }}</span>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 font-mono text-xs text-[var(--ll-text-muted)]">{{ party.gstin || '—' }}</td>
                    <td class="min-w-48 px-5 py-4">
                      @if (party.email) {
                        <div class="flex items-center gap-1.5 text-xs text-zinc-300"><svg lucideMail [size]="13"></svg><span class="truncate">{{ party.email }}</span></div>
                      }
                      @if (party.phone) {
                        <div class="mt-1 flex items-center gap-1.5 text-xs text-zinc-500"><svg lucidePhone [size]="13"></svg>{{ party.phone }}</div>
                      }
                      @if (!party.email && !party.phone) { <span class="text-xs text-zinc-600">—</span> }
                    </td>
                    <td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-300">{{ formatPaise(party.credit_limit_paise) }}</td>
                    <td class="whitespace-nowrap px-5 py-4">
                      <span class="ll-status" [class.ll-status-inactive]="!party.is_active">{{ party.is_active ? 'Active' : 'Inactive' }}</span>
                    </td>
                    <td class="whitespace-nowrap px-5 py-4">
                      <button
                        type="button"
                        class="ll-reminder-toggle"
                        [class.ll-reminder-off]="!party.email_reminders_enabled"
                        [disabled]="reminderSavingId() === party.id"
                        [attr.aria-label]="party.email_reminders_enabled ? 'Disable email reminders' : 'Enable email reminders'"
                        (click)="toggleReminders(party)"
                      >
                        <svg lucideToggleLeft [size]="16"></svg>
                        {{ reminderSavingId() === party.id ? 'Saving…' : (party.email_reminders_enabled ? 'On' : 'Off') }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">
            Showing {{ filteredParties().length }} of {{ parties().length }} parties
          </div>
        }
      </div>
    </section>

    @if (createFormOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeCreateForm()">
        <section class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="new-party-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-violet-300">Party master</p>
              <h2 id="new-party-title" class="mt-1 text-lg font-semibold text-white">Create party</h2>
            </div>
            <button type="button" class="ll-icon-button" aria-label="Close" (click)="closeCreateForm()">×</button>
          </div>

          <form class="mt-5 space-y-4" (submit)="createParty($event)">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="ll-label">Party code</span>
                <input class="ll-input mt-1.5 w-full" name="partyCode" maxlength="32" required [value]="formPartyCode()" (input)="formPartyCode.set($any($event.target).value)" placeholder="e.g. CUST-001" />
              </label>
              <label class="block">
                <span class="ll-label">Party type</span>
                <select class="ll-input mt-1.5 w-full" name="partyType" [value]="formPartyType()" (change)="formPartyType.set($any($event.target).value)">
                  @for (type of partyTypes; track type) {
                    <option [value]="type">{{ typeLabel(type) }}</option>
                  }
                </select>
              </label>
            </div>

            <label class="block">
              <span class="ll-label">Name</span>
              <input class="ll-input mt-1.5 w-full" name="name" maxlength="200" required [value]="formName()" (input)="formName.set($any($event.target).value)" placeholder="Customer or supplier legal name" />
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="ll-label">GSTIN <span class="font-normal text-zinc-600">(optional)</span></span>
                <input class="ll-input mt-1.5 w-full font-mono uppercase" name="gstin" maxlength="15" [value]="formGstin()" (input)="formGstin.set($any($event.target).value.toUpperCase())" placeholder="33AAAAA0000A1Z5" />
              </label>
              <label class="block">
                <span class="ll-label">Credit limit (₹) <span class="font-normal text-zinc-600">(optional)</span></span>
                <input class="ll-input mt-1.5 w-full" name="creditLimit" inputmode="decimal" [value]="formCreditLimit()" (input)="formCreditLimit.set($any($event.target).value)" placeholder="0.00" />
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block">
                <span class="ll-label">Email <span class="font-normal text-zinc-600">(optional)</span></span>
                <input class="ll-input mt-1.5 w-full" type="email" name="email" maxlength="254" [value]="formEmail()" (input)="formEmail.set($any($event.target).value)" placeholder="accounts@example.com" />
              </label>
              <label class="block">
                <span class="ll-label">Phone <span class="font-normal text-zinc-600">(optional)</span></span>
                <input class="ll-input mt-1.5 w-full" type="tel" name="phone" maxlength="32" [value]="formPhone()" (input)="formPhone.set($any($event.target).value)" placeholder="+91 98765 43210" />
              </label>
            </div>

            @if (formError()) {
              <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{{ formError() }}</p>
            }

            <div class="flex justify-end gap-2 border-t border-white/8 pt-4">
              <button type="button" class="ll-secondary-button" (click)="closeCreateForm()">Cancel</button>
              <button type="submit" class="ll-primary-button" [disabled]="saving()">
                @if (saving()) { Creating... } @else { Create party }
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
    .ll-party-type, .ll-status { display: inline-flex; align-items: center; border-radius: 999px; padding: .3rem .55rem; font-size: .68rem; font-weight: 600; }
    .ll-party-type { background: rgba(255,255,255,.05); color: #d4d4d8; }
    .ll-status { background: rgba(34,197,94,.10); color: #86efac; }
    .ll-status-inactive { background: rgba(244,63,94,.10); color: #fda4af; }
    .ll-reminder-toggle { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid rgba(167,139,250,.22); border-radius: .65rem; background: rgba(139,92,246,.09); padding: .35rem .55rem; color: #c4b5fd; font-size: .68rem; font-weight: 600; }
    .ll-reminder-toggle:hover:not(:disabled) { background: rgba(139,92,246,.16); }
    .ll-reminder-toggle:disabled { opacity: .55; }
    .ll-reminder-off { border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.025); color: #71717a; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartiesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly partyTypes = PARTY_TYPES;
  protected readonly parties = signal<Party[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly typeFilter = signal('all');
  protected readonly activeFilter = signal('true');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly createFormOpen = signal(false);
  protected readonly reminderSavingId = signal<string | null>(null);

  protected readonly formPartyCode = signal('');
  protected readonly formName = signal('');
  protected readonly formPartyType = signal<PartyType>('customer');
  protected readonly formGstin = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPhone = signal('');
  protected readonly formCreditLimit = signal('');

  protected readonly filteredParties = () => {
    const search = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();
    const active = this.activeFilter();

    return this.parties().filter((party) => {
      if (type !== 'all' && party.party_type !== type && party.party_type !== 'both') return false;
      if (active !== 'all' && String(party.is_active) !== active) return false;
      if (!search) return true;
      return [party.party_code, party.name, party.gstin, party.email, party.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  };

  constructor() {
    this.loadParties();
  }

  protected loadParties(): void {
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) return;

    this.loading.set(true);
    this.errorMessage.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params: Record<string, string> = { active: this.activeFilter() };
    if (this.typeFilter() !== 'all') params['type'] = this.typeFilter();

    this.http.get<{ parties: Party[] }>(`${API_BASE_URL}/companies/${companyId}/parties`, { headers, params })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.errorMessage.set('Unable to load parties. Please try again.');
          return of({ parties: [] });
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((response) => this.parties.set(response.parties ?? []));
  }

  protected openCreateForm(): void {
    this.formError.set('');
    this.createFormOpen.set(true);
  }

  protected closeCreateForm(): void {
    if (this.saving()) return;
    this.createFormOpen.set(false);
    this.formError.set('');
  }

  protected createParty(event: Event): void {
    event.preventDefault();
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) return;

    const partyCode = this.formPartyCode().trim();
    const name = this.formName().trim();
    const creditLimit = this.toPaise(this.formCreditLimit());

    if (!partyCode || !name) {
      this.formError.set('Party code and name are required.');
      return;
    }
    if (creditLimit === null) {
      this.formError.set('Credit limit must be a non-negative amount with at most two decimals.');
      return;
    }

    const body = {
      partyCode,
      name,
      partyType: this.formPartyType(),
      gstin: this.formGstin().trim() || undefined,
      email: this.formEmail().trim() || undefined,
      phone: this.formPhone().trim() || undefined,
      creditLimitPaise: creditLimit,
    };

    this.saving.set(true);
    this.formError.set('');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.post<{ party: Party }>(`${API_BASE_URL}/companies/${companyId}/parties`, body, { headers })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((error) => {
          this.formError.set(error?.status === 409
            ? 'A party with this code already exists.'
            : 'Unable to create the party. Check the details and try again.');
          return of(null);
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((response) => {
        if (!response?.party) return;
        this.parties.update((items) => [...items, response.party].sort((a, b) => a.name.localeCompare(b.name) || a.party_code.localeCompare(b.party_code)));
        this.resetForm();
        this.createFormOpen.set(false);
      });
  }

  protected toggleReminders(party: Party): void {
    const companyId = this.auth.selectedCompany()?.id;
    const token = this.auth.getAccessToken();
    if (!companyId || !token) return;

    this.reminderSavingId.set(party.id);
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.patch<{ id: string; emailRemindersEnabled: boolean }>(
      `${API_BASE_URL}/companies/${companyId}/parties/${party.id}/reminder-preference`,
      { enabled: !party.email_reminders_enabled },
      { headers },
    )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.errorMessage.set('Unable to update the reminder preference. Please try again.');
          return of(null);
        }),
        finalize(() => this.reminderSavingId.set(null)),
      )
      .subscribe((response) => {
        if (!response) return;
        this.parties.update((items) => items.map((item) => item.id === party.id
          ? { ...item, email_reminders_enabled: response.emailRemindersEnabled }
          : item));
      });
  }

  protected typeLabel(type: PartyType): string {
    return type === 'both' ? 'Customer & Supplier' : type.charAt(0).toUpperCase() + type.slice(1);
  }

  protected formatPaise(paise: string): string {
    const value = BigInt(paise || '0');
    const rupees = value / 100n;
    const cents = (value % 100n).toString().padStart(2, '0');
    return `₹${rupees.toLocaleString('en-IN')}.${cents}`;
  }

  private toPaise(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) return '0';
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [rupees, paise = ''] = normalized.split('.');
    return `${rupees}${paise.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '') || '0';
  }

  private resetForm(): void {
    this.formPartyCode.set('');
    this.formName.set('');
    this.formPartyType.set('customer');
    this.formGstin.set('');
    this.formEmail.set('');
    this.formPhone.set('');
    this.formCreditLimit.set('');
    this.formError.set('');
  }
}
