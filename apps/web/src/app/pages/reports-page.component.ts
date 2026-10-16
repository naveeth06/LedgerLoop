import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideBarChart3, LucideBookOpen, LucideCalculator, LucideFileText, LucideLandmark, LucideRefreshCw } from '@lucide/angular';
import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type ReportKey = 'trial-balance' | 'profit-and-loss' | 'balance-sheet' | 'receivables-ageing' | 'gst-summary' | 'inventory-valuation';
type AccountRow = { accountId: string; accountCode: string; accountName: string; accountType: string; debitPaise?: string; creditPaise?: string; balancePaise?: string; debitBalancePaise?: string; creditBalancePaise?: string };

type ReportState = {
  trial: any | null;
  pnl: any | null;
  balance: any | null;
  ageing: any | null;
  gst: any | null;
  inventory: any | null;
};

@Component({
  standalone: true,
  imports: [LucideBarChart3, LucideBookOpen, LucideCalculator, LucideFileText, LucideLandmark, LucideRefreshCw],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div class="flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideBarChart3 [size]="19"></svg></span><div><p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Reports</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Financial reports</h1></div></div>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-[var(--ll-text-muted)]">Live accounting reports sourced from posted tenant data. Nothing is fabricated in the browser.</p>
        </div>
        <div class="flex flex-wrap gap-2"><label class="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">From <input class="ll-input w-36" type="date" [value]="fromDate()" (change)="fromDate.set($any($event.target).value)" /></label><label class="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">To <input class="ll-input w-36" type="date" [value]="toDate()" (change)="toDate.set($any($event.target).value)" /></label><button type="button" class="ll-button-secondary" [disabled]="loading()" (click)="load()"><svg lucideRefreshCw [size]="15" [class.animate-spin]="loading()"></svg> Refresh</button></div>
      </header>

      @if (errorMessage()) { <div class="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100" role="alert">{{ errorMessage() }}</div> }

      <div class="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        @for (report of reports; track report.key) { <button type="button" class="rounded-xl border px-3 py-3 text-left transition" [class.border-violet-400\/30]="active() === report.key" [class.bg-violet-500\/10]="active() === report.key" [class.border-white\/8]="active() !== report.key" [class.bg-white\/\[0.02\]]="active() !== report.key" (click)="active.set(report.key)"><span class="flex items-center gap-2 text-xs font-medium text-white"><svg [attr.data-icon]="report.key" [size]="15" [class.text-violet-300]="active() === report.key" lucideFileText></svg>{{ report.label }}</span><span class="mt-1 block text-[10px] text-[var(--ll-text-muted)]">{{ report.caption }}</span></button> }
      </div>

      @if (active() === 'trial-balance') { <section class="ll-card mt-5 overflow-hidden"><div class="flex items-center justify-between border-b border-white/8 p-5"><div><h2 class="text-sm font-semibold text-white">Trial Balance</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Posted debit and credit balances through {{ trial()?.asOfDate || toDate() }}.</p></div><span class="ll-status">{{ trial()?.balanced ? 'Balanced' : 'Out of balance' }}</span></div><div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 text-xs uppercase tracking-[.08em] text-zinc-500"><tr><th class="px-5 py-3">Account</th><th class="px-5 py-3">Type</th><th class="px-5 py-3 text-right">Debit</th><th class="px-5 py-3 text-right">Credit</th></tr></thead><tbody class="divide-y divide-white/6">@for (row of trial()?.rows || []; track row.accountId) {<tr><td class="px-5 py-3"><p class="text-xs font-medium text-white">{{ row.accountName }}</p><p class="font-mono text-[10px] text-zinc-500">{{ row.accountCode }}</p></td><td class="px-5 py-3 text-xs text-zinc-400">{{ row.accountType }}</td><td class="px-5 py-3 text-right text-xs text-zinc-300">{{ money(row.debitBalancePaise) }}</td><td class="px-5 py-3 text-right text-xs text-zinc-300">{{ money(row.creditBalancePaise) }}</td></tr>} @empty {<tr><td colspan="4" class="p-10 text-center text-xs text-zinc-500">No ledger accounts found.</td></tr>}</tbody><tfoot class="border-t border-white/8"><tr><td colspan="2" class="px-5 py-3 text-xs font-medium text-white">Totals</td><td class="px-5 py-3 text-right text-xs font-semibold text-white">{{ money(trial()?.totals?.debitPaise || '0') }}</td><td class="px-5 py-3 text-right text-xs font-semibold text-white">{{ money(trial()?.totals?.creditPaise || '0') }}</td></tr></tfoot></table></div></section> }

      @if (active() === 'profit-and-loss') { <section class="mt-5 grid gap-4 lg:grid-cols-[1fr_1.5fr]"><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Profit & Loss</p><h2 class="mt-2 text-3xl font-semibold text-white">{{ money(pnl()?.netProfitPaise) }}</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">{{ pnl()?.fromDate }} → {{ pnl()?.toDate }}</p><div class="mt-6 space-y-4"><metric-row label="Income" [value]="money(pnl()?.incomePaise)"/><metric-row label="Expenses" [value]="money(pnl()?.expensePaise)"/></div></article><article class="ll-card overflow-hidden"><div class="border-b border-white/8 p-5"><h2 class="text-sm font-semibold text-white">Income & expense accounts</h2></div><div class="divide-y divide-white/6">@for (row of pnl()?.accounts || []; track row.accountId) {<div class="flex items-center justify-between gap-4 px-5 py-3"><div><p class="text-xs font-medium text-white">{{ row.accountName }}</p><p class="text-[10px] text-zinc-500">{{ row.accountCode }} · {{ row.accountType }}</p></div><span class="text-xs text-zinc-300">{{ money(row.balancePaise) }}</span></div>} @empty {<div class="p-10 text-center text-xs text-zinc-500">No posted income or expense activity.</div>}</div></article></section> }

      @if (active() === 'balance-sheet') { <section class="mt-5 grid gap-4 lg:grid-cols-3"><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Assets</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(balance()?.totals?.assetPaise) }}</p></article><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Liabilities</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(balance()?.totals?.liabilityPaise) }}</p></article><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Equity + retained earnings</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(balance()?.totals?.liabilitiesAndEquityPaise) }}</p><span class="mt-2 inline-block ll-status">{{ balance()?.balanced ? 'Balanced' : 'Check balances' }}</span></article><article class="ll-card overflow-hidden lg:col-span-3"><div class="border-b border-white/8 p-5"><h2 class="text-sm font-semibold text-white">Balance sheet accounts</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">As of {{ balance()?.asOfDate }}</p></div><div class="grid gap-px bg-white/6 sm:grid-cols-2 lg:grid-cols-3">@for (row of balance()?.accounts || []; track row.accountId) {<div class="bg-[var(--ll-surface)] p-4"><p class="text-xs font-medium text-white">{{ row.accountName }}</p><p class="mt-1 text-[10px] text-zinc-500">{{ row.accountCode }} · {{ row.accountType }}</p><p class="mt-2 text-sm font-semibold text-zinc-200">{{ money(row.balancePaise) }}</p></div>}</div></article></section> }

      @if (active() === 'receivables-ageing') { <section class="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]"><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Outstanding receivables</p><p class="mt-2 text-3xl font-semibold text-white">{{ money(ageing()?.totalOutstandingPaise) }}</p><div class="mt-6 space-y-3">@for (bucket of ageingBuckets; track bucket.key) {<div class="flex items-center justify-between text-xs"><span class="text-zinc-400">{{ bucket.label }}</span><span class="text-white">{{ money(ageing()?.buckets?.[bucket.key] || '0') }}</span></div>}</div></article><article class="ll-card overflow-hidden"><div class="border-b border-white/8 p-5"><h2 class="text-sm font-semibold text-white">Open invoices</h2></div><div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 text-xs text-zinc-500"><tr><th class="px-5 py-3">Invoice</th><th class="px-5 py-3">Customer</th><th class="px-5 py-3">Due</th><th class="px-5 py-3 text-right">Outstanding</th></tr></thead><tbody class="divide-y divide-white/6">@for (row of ageing()?.invoices || []; track row.invoiceId) {<tr><td class="px-5 py-3 text-xs text-white">{{ row.invoiceNumber }}</td><td class="px-5 py-3 text-xs text-zinc-300">{{ row.partyName }}</td><td class="px-5 py-3 text-xs text-zinc-400">{{ row.dueDate }}</td><td class="px-5 py-3 text-right text-xs font-medium text-white">{{ money(row.outstandingPaise) }}</td></tr>} @empty {<tr><td colspan="4" class="p-10 text-center text-xs text-zinc-500">No outstanding receivables.</td></tr>}</tbody></table></div></article></section> }

      @if (active() === 'gst-summary') { <section class="mt-5 grid gap-4 lg:grid-cols-3"><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Output GST</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(gst()?.sales?.totalGstPaise) }}</p><p class="mt-2 text-xs text-zinc-500">Sales · {{ money(gst()?.sales?.taxablePaise) }} taxable</p></article><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Input GST</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(gst()?.purchases?.totalGstPaise) }}</p><p class="mt-2 text-xs text-zinc-500">Purchases · {{ money(gst()?.purchases?.taxablePaise) }} taxable</p></article><article class="ll-card p-5"><p class="text-xs uppercase tracking-[.12em] text-zinc-500">Net GST payable</p><p class="mt-2 text-2xl font-semibold text-white">{{ money(gst()?.netGstPayablePaise) }}</p><p class="mt-2 text-xs text-zinc-500">CGST + SGST + IGST</p></article><article class="ll-card p-5 lg:col-span-3"><div class="grid gap-4 sm:grid-cols-2"><gst-block title="Sales tax" [data]="gst()?.sales"/><gst-block title="Purchase tax" [data]="gst()?.purchases"/></div></article></section> }

      @if (active() === 'inventory-valuation') { <section class="ll-card mt-5 overflow-hidden"><div class="flex items-center justify-between border-b border-white/8 p-5"><div><h2 class="text-sm font-semibold text-white">Inventory valuation</h2><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Current weighted-average stock valuation.</p></div><span class="text-sm font-semibold text-white">{{ money(inventory()?.totalCostPaise) }}</span></div><div class="overflow-x-auto"><table class="min-w-full text-left text-sm"><thead class="border-b border-white/8 text-xs text-zinc-500"><tr><th class="px-5 py-3">Item</th><th class="px-5 py-3">Warehouse</th><th class="px-5 py-3 text-right">Quantity</th><th class="px-5 py-3 text-right">Avg. cost</th><th class="px-5 py-3 text-right">Value</th></tr></thead><tbody class="divide-y divide-white/6">@for (row of inventory()?.balances || []; track row.itemId + row.warehouseId) {<tr><td class="px-5 py-3"><p class="text-xs text-white">{{ row.itemName }}</p><p class="font-mono text-[10px] text-zinc-500">{{ row.itemCode }}</p></td><td class="px-5 py-3 text-xs text-zinc-300">{{ row.warehouseName }}</td><td class="px-5 py-3 text-right text-xs text-zinc-300">{{ row.quantity }}</td><td class="px-5 py-3 text-right text-xs text-zinc-300">{{ money(row.averageCostPaise) }}</td><td class="px-5 py-3 text-right text-xs font-medium text-white">{{ money(row.totalCostPaise) }}</td></tr>} @empty {<tr><td colspan="5" class="p-10 text-center text-xs text-zinc-500">No inventory valuation records.</td></tr>}</tbody></table></div></section> }
    </section>
  `,
  styles: [`:host { display: block; } .ll-card { border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: color-mix(in srgb, var(--ll-surface) 88%, transparent); box-shadow: 0 16px 40px rgba(0,0,0,.08); } .ll-button-secondary { display:inline-flex; align-items:center; gap:.5rem; border:1px solid rgba(255,255,255,.08); border-radius:.75rem; padding:.55rem .8rem; color:var(--ll-text-muted); background:rgba(255,255,255,.03); } .ll-button-secondary:disabled { opacity:.5; } .ll-status { display:inline-flex; border:1px solid rgba(167,139,250,.2); border-radius:999px; padding:.2rem .5rem; font-size:10px; color:#c4b5fd; background:rgba(139,92,246,.08); } .ll-input { border:0; outline:none; background:transparent; color:var(--ll-text); font-size:12px; } metric-row, gst-block { display:block; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly active = signal<ReportKey>('trial-balance');
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly fromDate = signal(this.yearStart());
  protected readonly toDate = signal(this.today());
  protected readonly trial = signal<any | null>(null);
  protected readonly pnl = signal<any | null>(null);
  protected readonly balance = signal<any | null>(null);
  protected readonly ageing = signal<any | null>(null);
  protected readonly gst = signal<any | null>(null);
  protected readonly inventory = signal<any | null>(null);

  protected readonly reports = [
    { key: 'trial-balance' as ReportKey, label: 'Trial Balance', caption: 'Debits & credits' },
    { key: 'profit-and-loss' as ReportKey, label: 'Profit & Loss', caption: 'Income & expenses' },
    { key: 'balance-sheet' as ReportKey, label: 'Balance Sheet', caption: 'Assets & liabilities' },
    { key: 'receivables-ageing' as ReportKey, label: 'Receivables', caption: 'Open invoices' },
    { key: 'gst-summary' as ReportKey, label: 'GST Summary', caption: 'Input & output tax' },
    { key: 'inventory-valuation' as ReportKey, label: 'Inventory', caption: 'Stock valuation' },
  ];
  protected readonly ageingBuckets = [{ key: 'not-due', label: 'Not due' }, { key: '1-30', label: '1–30 days' }, { key: '31-60', label: '31–60 days' }, { key: '61-90', label: '61–90 days' }, { key: '90-plus', label: '90+ days' }];

  constructor() { this.load(); }

  protected load(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('Select a company before loading reports.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const q = (params: Record<string, string>) => Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const fromDate = this.fromDate(); const toDate = this.toDate();
    this.http.get(`${API_BASE_URL}/companies/${companyId}/reports/trial-balance?${q({ asOfDate: toDate })}`).subscribe({ next: v => this.trial.set(v), error: e => this.capture(e) });
    this.http.get(`${API_BASE_URL}/companies/${companyId}/reports/profit-and-loss?${q({ fromDate, toDate })}`).subscribe({ next: v => this.pnl.set(v), error: e => this.capture(e) });
    this.http.get(`${API_BASE_URL}/companies/${companyId}/reports/balance-sheet?${q({ asOfDate: toDate })}`).subscribe({ next: v => this.balance.set(v), error: e => this.capture(e) });
    this.http.get(`${API_BASE_URL}/companies/${companyId}/reports/receivables-ageing?${q({ asOfDate: toDate })}`).subscribe({ next: v => this.ageing.set(v), error: e => this.capture(e) });
    this.http.get(`${API_BASE_URL}/companies/${companyId}/reports/gst-summary?${q({ fromDate, toDate })}`).subscribe({ next: v => this.gst.set(v), error: e => this.capture(e) });
    this.http.get(`${API_BASE_URL}/companies/${companyId}/inventory/valuation`).subscribe({ next: v => { this.inventory.set(v); this.finish(); }, error: e => { this.capture(e); this.finish(); } });
  }

  private finish(): void { this.loading.set(false); this.changeDetector.markForCheck(); }
  private capture(error: any): void { const message = error?.error?.message || error?.message || 'A report could not be loaded.'; this.errorMessage.set(message); this.changeDetector.markForCheck(); }
  protected money(paise?: string): string { const value = Number(BigInt(paise || '0')) / 100; return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value); }
  private today(): string { return new Date().toISOString().slice(0, 10); }
  private yearStart(): string { return `${new Date().getUTCFullYear()}-01-01`; }
}
