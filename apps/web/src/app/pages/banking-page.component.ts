import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideCheck, LucideChevronDown, LucideDownload, LucideLandmark, LucidePlus, LucideRefreshCw, LucideUpload, LucideX } from '@lucide/angular';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { MotionService } from '../services/motion.service';

interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
  isActive: boolean;
}

interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  ledgerAccountId: string;
  isActive: boolean;
  createdAt: string;
}

interface StatementTransaction {
  id: string;
  transactionDate: string;
  valueDate?: string;
  transactionType: 'debit' | 'credit';
  amountPaise: string;
  description: string;
  reference?: string;
  externalId?: string;
  balanceAfterPaise?: string;
  status: 'unreconciled' | 'reconciled';
  matchedJournalLineId?: string;
  matchedAt?: string;
}

interface MatchSuggestion {
  journalLineId: string;
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  memo?: string;
  lineDescription?: string;
  debitPaise: string;
  creditPaise: string;
  dayDistance: number;
  confidence: number;
  confidenceBand: 'high' | 'medium' | 'low';
}

interface ImportPayload {
  sourceName?: string;
  rows: Array<{
    transactionDate: string;
    valueDate?: string;
    transactionType: 'debit' | 'credit';
    amountPaise: string;
    description: string;
    reference?: string;
    externalId?: string;
    balanceAfterPaise?: string;
  }>;
}

@Component({
  selector: 'll-banking-page',
  standalone: true,
  imports: [FormsModule, LucideCheck, LucideChevronDown, LucideDownload, LucideLandmark, LucidePlus, LucideRefreshCw, LucideUpload, LucideX],
  template: `
    <section class="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              <svg lucideLandmark [size]="19"></svg>
            </span>
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">Banking</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white">Bank accounts &amp; reconciliation</h1>
            </div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Connect company bank accounts, import statements, and reconcile statement lines against posted accounting entries without changing accounting data automatically.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="ll-button-secondary" type="button" [disabled]="loading" (click)="loadAll()">
            <svg lucideRefreshCw [size]="15"></svg>Refresh
          </button>
          <button class="ll-button-secondary" type="button" (click)="openImport()" [disabled]="!selectedBankAccount">
            <svg lucideUpload [size]="15"></svg>Import statement
          </button>
          <button class="ll-button-primary" type="button" (click)="openCreateAccount()">
            <svg lucidePlus [size]="15"></svg>Add bank account
          </button>
        </div>
      </div>

      @if (error) {
        <div class="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</div>
      }
      @if (success) {
        <div class="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{{ success }}</div>
      }

      <div class="grid gap-4 md:grid-cols-3">
        <article class="rounded-2xl border border-white/8 bg-[var(--ll-surface)] p-5">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--ll-text-muted)]">Bank accounts</p>
          <p class="mt-2 text-2xl font-semibold text-white">{{ bankAccounts.length }}</p>
          <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Active company connections</p>
        </article>
        <article class="rounded-2xl border border-white/8 bg-[var(--ll-surface)] p-5">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--ll-text-muted)]">Unreconciled</p>
          <p class="mt-2 text-2xl font-semibold text-amber-200">{{ unreconciledCount }}</p>
          <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Statement lines awaiting review</p>
        </article>
        <article class="rounded-2xl border border-white/8 bg-[var(--ll-surface)] p-5">
          <p class="text-xs font-medium uppercase tracking-wider text-[var(--ll-text-muted)]">Selected account</p>
          <p class="mt-2 truncate text-lg font-semibold text-white">{{ selectedBankAccount?.accountName || 'None' }}</p>
          <p class="mt-1 truncate text-xs text-[var(--ll-text-muted)]">{{ selectedBankAccount?.bankName || 'Select an account below' }}</p>
        </article>
      </div>

      <section class="rounded-2xl border border-white/8 bg-[var(--ll-surface)] p-5 sm:p-6">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-white">Connected accounts</h2>
            <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Each bank account must point to an active asset ledger account.</p>
          </div>
          @if (loading) { <span class="text-xs text-[var(--ll-text-muted)]">Loading…</span> }
        </div>

        @if (!bankAccounts.length && !loading) {
          <div class="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
            <p class="text-sm font-medium text-white">No bank accounts connected</p>
            <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Create one to import statements and reconcile transactions.</p>
          </div>
        } @else {
          <div class="grid gap-3 lg:grid-cols-2">
            @for (account of bankAccounts; track account.id) {
              <button type="button" class="rounded-xl border p-4 text-left transition" [class.border-violet-400/40]="selectedBankAccount?.id === account.id" [class.bg-violet-500/[0.07]]="selectedBankAccount?.id === account.id" [class.border-white/8]="selectedBankAccount?.id !== account.id" [class.bg-white/[0.02]]="selectedBankAccount?.id !== account.id" (click)="selectBankAccount(account)">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-white">{{ account.accountName }}</p>
                    <p class="mt-1 truncate text-xs text-[var(--ll-text-muted)]">{{ account.bankName }}</p>
                  </div>
                  <span class="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">Active</span>
                </div>
                <p class="mt-4 text-xs text-[var(--ll-text-muted)]">Ledger account: <span class="text-zinc-300">{{ ledgerAccountLabel(account.ledgerAccountId) }}</span></p>
              </button>
            }
          </div>
        }
      </section>

      @if (selectedBankAccount) {
        <section class="rounded-2xl border border-white/8 bg-[var(--ll-surface)] p-5 sm:p-6">
          <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-base font-semibold text-white">Statement transactions</h2>
              <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Review imported lines and reconcile only when the suggested posted journal line matches the required account, amount, and date window.</p>
            </div>
            <div class="flex items-center gap-2">
              <button class="ll-button-secondary" type="button" (click)="openImport()"><svg lucideUpload [size]="14"></svg>Import</button>
              <button class="ll-button-secondary" type="button" (click)="loadTransactions()"><svg lucideRefreshCw [size]="14"></svg>Refresh</button>
            </div>
          </div>

          @if (!transactions.length && !loadingTransactions) {
            <div class="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
              <p class="text-sm font-medium text-white">No statement transactions</p>
              <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Import a JSON statement to start reconciliation.</p>
            </div>
          } @else {
            <div class="overflow-x-auto rounded-xl border border-white/8">
              <table class="min-w-full text-left text-xs">
                <thead class="border-b border-white/8 bg-white/[0.02] text-[var(--ll-text-muted)]">
                  <tr><th class="px-4 py-3 font-medium">Date</th><th class="px-4 py-3 font-medium">Description</th><th class="px-4 py-3 font-medium">Type</th><th class="px-4 py-3 text-right font-medium">Amount</th><th class="px-4 py-3 font-medium">Status</th><th class="px-4 py-3 text-right font-medium">Action</th></tr>
                </thead>
                <tbody class="divide-y divide-white/6">
                  @for (transaction of transactions; track transaction.id) {
                    <tr class="transition hover:bg-white/[0.025]">
                      <td class="whitespace-nowrap px-4 py-3 text-zinc-300">{{ transaction.transactionDate }}</td>
                      <td class="min-w-64 px-4 py-3"><p class="truncate font-medium text-white">{{ transaction.description }}</p><p class="mt-1 truncate text-[10px] text-[var(--ll-text-muted)]">{{ transaction.reference || transaction.externalId || '—' }}</p></td>
                      <td class="px-4 py-3"><span [class]="transaction.transactionType === 'credit' ? 'text-emerald-300' : 'text-rose-300'">{{ transaction.transactionType === 'credit' ? 'Credit' : 'Debit' }}</span></td>
                      <td class="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-100">{{ formatPaise(transaction.amountPaise) }}</td>
                      <td class="px-4 py-3"><span class="rounded-full border px-2 py-1 text-[10px]" [class.border-amber-400/20]="transaction.status === 'unreconciled'" [class.bg-amber-500/10]="transaction.status === 'unreconciled'" [class.text-amber-200]="transaction.status === 'unreconciled'" [class.border-emerald-400/20]="transaction.status === 'reconciled'" [class.bg-emerald-500/10]="transaction.status === 'reconciled'" [class.text-emerald-200]="transaction.status === 'reconciled'">{{ transaction.status }}</span></td>
                      <td class="px-4 py-3 text-right">
                        @if (transaction.status === 'unreconciled') {
                          <button class="ll-button-secondary !px-2.5 !py-1.5" type="button" (click)="reviewTransaction(transaction)"><svg lucideChevronDown [size]="13"></svg>Review</button>
                        } @else { <span class="text-[10px] text-emerald-300">Matched</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </section>

    @if (showCreateAccount) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" (click)="closeCreateAccount()">
        <section class="w-full max-w-lg rounded-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="bank-account-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between"><div><h2 id="bank-account-title" class="text-lg font-semibold text-white">Add bank account</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Link a bank account to an existing active asset ledger account.</p></div><button class="ll-icon-button" type="button" aria-label="Close" (click)="closeCreateAccount()"><svg lucideX [size]="17"></svg></button></div>
          <div class="mt-5 space-y-4">
            <label class="block"><span class="ll-field-label">Account name</span><input class="ll-input" [(ngModel)]="newAccount.accountName" placeholder="Main Bank Account" /></label>
            <label class="block"><span class="ll-field-label">Bank name</span><input class="ll-input" [(ngModel)]="newAccount.bankName" placeholder="Example Bank" /></label>
            <label class="block"><span class="ll-field-label">Ledger account</span><select class="ll-input" [(ngModel)]="newAccount.ledgerAccountId"><option value="">Select asset account</option>@for (account of assetAccounts; track account.id) {<option [value]="account.id">{{ account.code }} · {{ account.name }}</option>}</select></label>
            @if (!assetAccounts.length) { <p class="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-200">Create an active asset account in Chart of Accounts before connecting a bank account.</p> }
          </div>
          <div class="mt-6 flex justify-end gap-2"><button class="ll-button-secondary" type="button" (click)="closeCreateAccount()">Cancel</button><button class="ll-button-primary" type="button" [disabled]="saving || !newAccount.accountName.trim() || !newAccount.bankName.trim() || !newAccount.ledgerAccountId" (click)="createBankAccount()">{{ saving ? 'Creating…' : 'Create account' }}</button></div>
        </section>
      </div>
    }

    @if (showImport) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" (click)="closeImport()">
        <section class="w-full max-w-xl rounded-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="import-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between"><div><h2 id="import-title" class="text-lg font-semibold text-white">Import bank statement</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Use a JSON file matching the API statement schema. Existing external IDs are safely skipped.</p></div><button class="ll-icon-button" type="button" aria-label="Close" (click)="closeImport()"><svg lucideX [size]="17"></svg></button></div>
          <label class="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center hover:bg-white/[0.04]"><svg lucideUpload [size]="20" class="text-violet-300"></svg><span class="mt-3 text-sm font-medium text-white">Choose JSON statement</span><span class="mt-1 text-xs text-[var(--ll-text-muted)]">Maximum 10,000 rows per import</span><input class="sr-only" type="file" accept="application/json,.json" (change)="onImportFile($event)" /></label>
          @if (importFileName) { <p class="mt-3 text-xs text-zinc-300">Selected: {{ importFileName }}</p> }
          @if (importPreview) { <div class="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4"><p class="text-xs font-medium text-white">{{ importPreview.sourceName || 'Statement' }}</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">{{ importPreview.rows.length }} rows ready to import.</p></div> }
          <div class="mt-6 flex justify-end gap-2"><button class="ll-button-secondary" type="button" (click)="closeImport()">Cancel</button><button class="ll-button-primary" type="button" [disabled]="saving || !importPreview || !selectedBankAccount" (click)="importStatement()">{{ saving ? 'Importing…' : 'Import statement' }}</button></div>
        </section>
      </div>
    }

    @if (selectedTransaction) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" (click)="closeReview()">
        <section class="w-full max-w-2xl rounded-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="review-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between"><div><p class="text-xs uppercase tracking-wider text-violet-300">Reconciliation review</p><h2 id="review-title" class="mt-1 text-lg font-semibold text-white">{{ selectedTransaction.description }}</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">{{ selectedTransaction.transactionDate }} · {{ formatPaise(selectedTransaction.amountPaise) }}</p></div><button class="ll-icon-button" type="button" aria-label="Close" (click)="closeReview()"><svg lucideX [size]="17"></svg></button></div>
          @if (suggestionsLoading) { <p class="py-10 text-center text-sm text-[var(--ll-text-muted)]">Finding matching posted journal lines…</p> }
          @else if (!suggestions.length) { <div class="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">No matching posted journal line was found within the permitted account, amount, and three-day window.</div> }
          @else {
            <div class="mt-5 space-y-2">
              @for (suggestion of suggestions; track suggestion.journalLineId) {
                <button type="button" class="w-full rounded-xl border border-white/8 bg-white/[0.02] p-4 text-left transition hover:border-violet-400/30 hover:bg-violet-500/[0.05]" (click)="matchSuggestion(suggestion)">
                  <div class="flex items-start justify-between gap-4"><div><p class="text-sm font-medium text-white">{{ suggestion.entryNumber }}</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">{{ suggestion.entryDate }} · {{ suggestion.memo || suggestion.lineDescription || 'Journal entry' }}</p></div><span class="rounded-full border px-2 py-1 text-[10px]" [class.border-emerald-400/20]="suggestion.confidenceBand === 'high'" [class.text-emerald-200]="suggestion.confidenceBand === 'high'" [class.border-amber-400/20]="suggestion.confidenceBand === 'medium'" [class.text-amber-200]="suggestion.confidenceBand === 'medium'" [class.border-white/10]="suggestion.confidenceBand === 'low'" [class.text-zinc-300]="suggestion.confidenceBand === 'low'">{{ suggestion.confidenceBand }} · {{ suggestion.confidence * 100 | number:'1.0-0' }}%</span></div>
                  <p class="mt-3 text-xs text-zinc-300">{{ suggestion.dayDistance }} day{{ suggestion.dayDistance === 1 ? '' : 's' }} from statement date</p>
                </button>
              }
            </div>
            <p class="mt-4 text-[11px] leading-5 text-[var(--ll-text-muted)]">Selecting a suggestion only marks the statement line as reconciled. Low-confidence suggestions are never auto-posted.</p>
          }
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankingPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly motion = inject(MotionService);
  private readonly apiBase = environment.apiBaseUrl;

  protected bankAccounts: BankAccount[] = [];
  protected ledgerAccounts: LedgerAccount[] = [];
  protected assetAccounts: LedgerAccount[] = [];
  protected transactions: StatementTransaction[] = [];
  protected selectedBankAccount: BankAccount | null = null;
  protected selectedTransaction: StatementTransaction | null = null;
  protected suggestions: MatchSuggestion[] = [];
  protected loading = false;
  protected loadingTransactions = false;
  protected suggestionsLoading = false;
  protected saving = false;
  protected error = '';
  protected success = '';
  protected showCreateAccount = false;
  protected showImport = false;
  protected importFileName = '';
  protected importPreview: ImportPayload | null = null;
  protected newAccount = { accountName: '', bankName: '', ledgerAccountId: '' };

  private get companyId(): string {
    return this.auth.selectedCompany()?.id || '';
  }

  protected get unreconciledCount(): number {
    return this.transactions.filter((transaction) => transaction.status === 'unreconciled').length;
  }

  constructor() {
    this.loadAll();
  }

  protected loadAll(): void {
    if (!this.companyId) return;
    this.loading = true;
    this.error = '';
    this.http.get<{ bankAccounts: BankAccount[] }>(`${this.apiBase}/companies/${this.companyId}/bank-accounts`).subscribe({
      next: (response) => {
        this.bankAccounts = response.bankAccounts || [];
        this.selectedBankAccount = this.selectedBankAccount && this.bankAccounts.some((account) => account.id === this.selectedBankAccount?.id)
          ? this.bankAccounts.find((account) => account.id === this.selectedBankAccount?.id) || null
          : this.bankAccounts[0] || null;
        this.loading = false;
        this.loadAccounts();
        this.loadTransactions();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Unable to load bank accounts.';
        this.cdr.markForCheck();
      },
    });
  }

  private loadAccounts(): void {
    this.http.get<{ accounts: LedgerAccount[] }>(`${this.apiBase}/companies/${this.companyId}/accounts`).subscribe({
      next: (response) => {
        this.ledgerAccounts = response.accounts || [];
        this.assetAccounts = this.ledgerAccounts.filter((account) => account.accountType === 'asset' && account.isActive);
        this.cdr.markForCheck();
      },
      error: () => this.cdr.markForCheck(),
    });
  }

  protected selectBankAccount(account: BankAccount): void {
    this.selectedBankAccount = account;
    this.success = '';
    this.loadTransactions();
  }

  protected loadTransactions(): void {
    if (!this.companyId || !this.selectedBankAccount) {
      this.transactions = [];
      return;
    }
    this.loadingTransactions = true;
    this.http.get<{ transactions: StatementTransaction[] }>(`${this.apiBase}/companies/${this.companyId}/bank-accounts/${this.selectedBankAccount.id}/statement-imports`).subscribe({
      next: (response) => {
        this.transactions = response.transactions || [];
        this.loadingTransactions = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingTransactions = false;
        this.error = err?.error?.message || 'Unable to load statement transactions.';
        this.cdr.markForCheck();
      },
    });
  }

  protected openCreateAccount(): void {
    this.error = '';
    this.success = '';
    this.newAccount = { accountName: '', bankName: '', ledgerAccountId: '' };
    this.showCreateAccount = true;
  }

  protected closeCreateAccount(): void {
    if (!this.saving) this.showCreateAccount = false;
  }

  protected createBankAccount(): void {
    if (!this.companyId || this.saving) return;
    this.saving = true;
    this.error = '';
    this.http.post<{ bankAccount: BankAccount }>(`${this.apiBase}/companies/${this.companyId}/bank-accounts`, this.newAccount).subscribe({
      next: (response) => {
        this.bankAccounts = [...this.bankAccounts, response.bankAccount];
        this.selectedBankAccount = response.bankAccount;
        this.showCreateAccount = false;
        this.saving = false;
        this.success = 'Bank account connected.';
        this.loadTransactions();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to create bank account.';
        this.cdr.markForCheck();
      },
    });
  }

  protected openImport(): void {
    if (!this.selectedBankAccount) return;
    this.error = '';
    this.success = '';
    this.importFileName = '';
    this.importPreview = null;
    this.showImport = true;
  }

  protected closeImport(): void {
    if (!this.saving) this.showImport = false;
  }

  protected onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName = file.name;
    this.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ImportPayload;
        if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length < 1 || parsed.rows.length > 10000) throw new Error('The JSON must contain between 1 and 10,000 rows.');
        this.importPreview = parsed;
      } catch (err) {
        this.importPreview = null;
        this.error = err instanceof Error ? err.message : 'The selected statement JSON is invalid.';
      }
      this.cdr.markForCheck();
    };
    reader.onerror = () => {
      this.importPreview = null;
      this.error = 'Unable to read the selected file.';
      this.cdr.markForCheck();
    };
    reader.readAsText(file);
  }

  protected importStatement(): void {
    if (!this.companyId || !this.selectedBankAccount || !this.importPreview || this.saving) return;
    this.saving = true;
    this.error = '';
    this.http.post<{ importedCount: number; skippedCount: number }>(`${this.apiBase}/companies/${this.companyId}/bank-accounts/${this.selectedBankAccount.id}/statement-imports`, this.importPreview).subscribe({
      next: (response) => {
        this.saving = false;
        this.showImport = false;
        this.success = `${response.importedCount} statement line${response.importedCount === 1 ? '' : 's'} imported${response.skippedCount ? `; ${response.skippedCount} duplicate${response.skippedCount === 1 ? '' : 's'} skipped` : ''}.`;
        this.loadTransactions();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to import the statement.';
        this.cdr.markForCheck();
      },
    });
  }

  protected reviewTransaction(transaction: StatementTransaction): void {
    if (!this.selectedBankAccount) return;
    this.selectedTransaction = transaction;
    this.suggestions = [];
    this.suggestionsLoading = true;
    this.error = '';
    this.http.get<{ suggestions: MatchSuggestion[] }>(`${this.apiBase}/companies/${this.companyId}/bank-accounts/${this.selectedBankAccount.id}/reconciliation/suggestions/${transaction.id}`).subscribe({
      next: (response) => {
        this.suggestions = response.suggestions || [];
        this.suggestionsLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.suggestionsLoading = false;
        this.error = err?.error?.message || 'Unable to load reconciliation suggestions.';
        this.cdr.markForCheck();
      },
    });
  }

  protected closeReview(): void {
    if (!this.suggestionsLoading) this.selectedTransaction = null;
  }

  protected matchSuggestion(suggestion: MatchSuggestion): void {
    if (!this.selectedBankAccount || !this.selectedTransaction || this.saving) return;
    this.saving = true;
    this.error = '';
    this.http.post(`${this.apiBase}/companies/${this.companyId}/bank-accounts/${this.selectedBankAccount.id}/reconciliation/${this.selectedTransaction.id}/match`, { journalLineId: suggestion.journalLineId }).subscribe({
      next: () => {
        this.saving = false;
        this.selectedTransaction = null;
        this.success = `Statement line reconciled to ${suggestion.entryNumber}.`;
        this.loadTransactions();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to reconcile the statement line.';
        this.cdr.markForCheck();
      },
    });
  }

  protected ledgerAccountLabel(id: string): string {
    const account = this.ledgerAccounts.find((candidate) => candidate.id === id);
    return account ? `${account.code} · ${account.name}` : id;
  }

  protected formatPaise(value: string): string {
    const paise = Number(value);
    if (!Number.isFinite(paise)) return '₹0.00';
    return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
