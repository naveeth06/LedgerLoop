import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import {
  LucideArrowDownRight,
  LucideArrowUpRight,
  LucideBarChart3,
  LucideBanknote,
  LucideBoxes,
  LucideCircleAlert,
  LucideFileText,
  LucideLandmark,
  LucideReceiptIndianRupee,
  LucideRefreshCw,
  LucideWallet,
} from '@lucide/angular';
import { DashboardData, DashboardDataService } from '../services/dashboard-data.service';

@Component({
  standalone: true,
  imports: [
    LucideArrowDownRight,
    LucideArrowUpRight,
    LucideBarChart3,
    LucideBanknote,
    LucideBoxes,
    LucideCircleAlert,
    LucideFileText,
    LucideLandmark,
    LucideReceiptIndianRupee,
    LucideRefreshCw,
    LucideWallet,
  ],
  template: `
    <section class="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="ll-eyebrow">Financial overview</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Business dashboard</h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-[var(--ll-text-muted)]">A live view of profitability, liquidity, working capital, inventory and accounting activity.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select class="ll-button-secondary appearance-none" aria-label="Dashboard period" (change)="setPeriod($any($event.target).value)">
            <option value="fy">Financial year</option>
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
          </select>
          <button type="button" class="ll-button-secondary" (click)="loadDashboard()" [disabled]="loading">
            <svg lucideRefreshCw [size]="15" [class.animate-spin]="loading"></svg>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      @if (errorMessage) {
        <article class="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <div class="flex gap-3">
            <svg class="mt-0.5 shrink-0 text-amber-300" lucideCircleAlert [size]="18"></svg>
            <div>
              <p class="text-sm font-medium text-white">Live dashboard data is not connected</p>
              <p class="mt-1 text-xs leading-5 text-[var(--ll-text-muted)]">{{ errorMessage }}</p>
            </div>
          </div>
        </article>
      }

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        @for (metric of kpis; track metric.label) {
          <article class="ll-card p-5">
            <div class="flex items-start justify-between gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/10 text-violet-300">
                @switch (metric.icon) {
                  @case ('revenue') { <svg lucideReceiptIndianRupee [size]="17"></svg> }
                  @case ('profit') { <svg lucideBanknote [size]="17"></svg> }
                  @case ('cash') { <svg lucideWallet [size]="17"></svg> }
                  @case ('receivable') { <svg lucideArrowUpRight [size]="17"></svg> }
                  @case ('payable') { <svg lucideArrowDownRight [size]="17"></svg> }
                  @case ('inventory') { <svg lucideBoxes [size]="17"></svg> }
                }
              </span>
              <span class="text-[11px] text-[var(--ll-text-muted)]">{{ metric.caption }}</span>
            </div>
            <p class="mt-5 text-xs font-medium text-[var(--ll-text-muted)]">{{ metric.label }}</p>
            <p class="mt-1 truncate text-xl font-semibold tracking-tight text-white">{{ metric.value }}</p>
            @if (metric.subValue) {
              <p class="mt-1 text-[11px] text-[var(--ll-text-muted)]">{{ metric.subValue }}</p>
            }
          </article>
        }
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-white">Revenue, expenses & profit</p>
              <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Posted journal activity by month.</p>
            </div>
            <svg class="text-[var(--ll-text-muted)]" lucideBarChart3 [size]="18"></svg>
          </div>
          @if (pnl.length) {
            <div class="mt-7 grid h-64 grid-cols-12 items-end gap-2 border-b border-white/8 px-1 pb-0 sm:gap-3">
              @for (item of pnl; track item.label) {
                <div class="group flex h-full min-w-0 flex-col justify-end gap-2">
                  <div class="flex h-[calc(100%-24px)] items-end justify-center gap-0.5">
                    <div class="w-1/3 rounded-t bg-violet-500/80" [style.height.%]="barHeight(item.revenue_paise, pnlMax)"></div>
                    <div class="w-1/3 rounded-t bg-fuchsia-400/70" [style.height.%]="barHeight(item.expense_paise, pnlMax)"></div>
                    <div class="w-1/3 rounded-t bg-white/25" [style.height.%]="barHeight(item.profit_paise, pnlMax)"></div>
                  </div>
                  <span class="truncate text-center text-[9px] text-[var(--ll-text-muted)]">{{ shortMonth(item.label) }}</span>
                </div>
              }
            </div>
            <div class="mt-4 flex flex-wrap gap-4 text-[11px] text-[var(--ll-text-muted)]">
              <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500"></i>Revenue</span>
              <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-fuchsia-400"></i>Expenses</span>
              <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-white/30"></i>Profit</span>
            </div>
          } @else { <div class="ll-chart-empty">No posted financial activity for this period.</div> }
        </article>

        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <div><p class="text-sm font-semibold text-white">Cash movement</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Imported bank inflows and outflows.</p></div>
            <svg class="text-[var(--ll-text-muted)]" lucideLandmark [size]="18"></svg>
          </div>
          @if (cash.length) {
            <div class="mt-7 space-y-4">
              @for (item of cash; track item.label) {
                <div>
                  <div class="mb-1 flex justify-between text-[10px] text-[var(--ll-text-muted)]"><span>{{ item.label }}</span><span>{{ money(item.net_paise) }}</span></div>
                  <div class="grid grid-cols-2 gap-1">
                    <div class="h-2 rounded-l-full bg-violet-500/70" [style.width.%]="relativeBar(item.inflow_paise, cashMax)"></div>
                    <div class="h-2 rounded-r-full bg-fuchsia-400/60" [style.width.%]="relativeBar(item.outflow_paise, cashMax)"></div>
                  </div>
                </div>
              }
            </div>
          } @else { <div class="ll-chart-empty">No bank statement activity is available.</div> }
        </article>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Revenue mix</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Top income accounts.</p></div><svg class="text-[var(--ll-text-muted)]" lucideReceiptIndianRupee [size]="18"></svg></div>
          <div class="mt-6 space-y-4">
            @for (item of revenueMix; track item.code) {
              <div><div class="mb-1 flex justify-between gap-4 text-xs"><span class="truncate text-white">{{ item.label }}</span><span class="shrink-0 text-[var(--ll-text-muted)]">{{ money(item.amount_paise) }}</span></div><div class="h-2 rounded-full bg-white/6"><div class="h-full rounded-full bg-violet-500/80" [style.width.%]="relativeBar(item.amount_paise, revenueMixMax)"></div></div></div>
            } @empty { <div class="ll-chart-empty">No income accounts have posted activity.</div> }
          </div>
        </article>

        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Expense mix</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Top expense accounts.</p></div><svg class="text-[var(--ll-text-muted)]" lucideBarChart3 [size]="18"></svg></div>
          <div class="mt-6 space-y-4">
            @for (item of expenseMix; track item.code) {
              <div><div class="mb-1 flex justify-between gap-4 text-xs"><span class="truncate text-white">{{ item.label }}</span><span class="shrink-0 text-[var(--ll-text-muted)]">{{ money(item.amount_paise) }}</span></div><div class="h-2 rounded-full bg-white/6"><div class="h-full rounded-full bg-fuchsia-400/70" [style.width.%]="relativeBar(item.amount_paise, expenseMixMax)"></div></div></div>
            } @empty { <div class="ll-chart-empty">No expense accounts have posted activity.</div> }
          </div>
        </article>
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Receivables ageing</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Outstanding customer invoices.</p></div><svg class="text-[var(--ll-text-muted)]" lucideArrowUpRight [size]="18"></svg></div>
          <div class="mt-6 grid grid-cols-5 gap-2">
            @for (bucket of ageingBuckets; track bucket.key) { <div class="min-w-0"><div class="flex h-32 items-end rounded-lg bg-white/[0.025] p-1"><div class="w-full rounded-md bg-violet-500/75" [style.height.%]="ageingHeight(receivables, bucket.key, receivablesMax)"></div></div><p class="mt-2 truncate text-center text-[10px] text-[var(--ll-text-muted)]">{{ bucket.label }}</p><p class="mt-1 truncate text-center text-[10px] text-white">{{ money(receivables[bucket.key] || '0') }}</p></div> }
          </div>
        </article>

        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Payables ageing</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Outstanding supplier bills.</p></div><svg class="text-[var(--ll-text-muted)]" lucideArrowDownRight [size]="18"></svg></div>
          <div class="mt-6 grid grid-cols-5 gap-2">
            @for (bucket of ageingBuckets; track bucket.key) { <div class="min-w-0"><div class="flex h-32 items-end rounded-lg bg-white/[0.025] p-1"><div class="w-full rounded-md bg-fuchsia-400/70" [style.height.%]="ageingHeight(payables, bucket.key, payablesMax)"></div></div><p class="mt-2 truncate text-center text-[10px] text-[var(--ll-text-muted)]">{{ bucket.label }}</p><p class="mt-1 truncate text-center text-[10px] text-white">{{ money(payables[bucket.key] || '0') }}</p></div> }
          </div>
        </article>
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Recent accounting activity</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Latest posted journal entries.</p></div><svg class="text-[var(--ll-text-muted)]" lucideFileText [size]="18"></svg></div>
          <div class="mt-5 divide-y divide-white/6">
            @for (item of activity; track item.id) { <div class="flex items-center gap-4 py-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-violet-300"><svg lucideFileText [size]="15"></svg></span><div class="min-w-0 flex-1"><p class="truncate text-xs font-medium text-white">{{ item.description || item.reference }}</p><p class="mt-1 truncate text-[10px] text-[var(--ll-text-muted)]">{{ item.reference }} · {{ item.source }}</p></div><span class="shrink-0 text-[10px] text-[var(--ll-text-muted)]">{{ item.date }}</span></div> }
            @empty { <div class="ll-chart-empty">No posted journal entries yet.</div> }
          </div>
        </article>

        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between"><div><p class="text-sm font-semibold text-white">Balance snapshot</p><p class="mt-1 text-xs text-[var(--ll-text-muted)]">Current accounting position.</p></div><svg class="text-[var(--ll-text-muted)]" lucideLandmark [size]="18"></svg></div>
          <div class="mt-6 space-y-5">
            @for (row of balanceRows; track row.label) { <div><div class="flex justify-between text-xs"><span class="text-[var(--ll-text-muted)]">{{ row.label }}</span><span class="font-medium text-white">{{ row.value }}</span></div><div class="mt-2 h-1.5 rounded-full bg-white/6"><div class="h-full rounded-full bg-violet-500/70" [style.width.%]="relativeBar(row.raw, balanceMax)"></div></div></div> }
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`:host { display: block; } .ll-chart-empty { min-height: 180px; display: grid; place-items: center; text-align: center; color: var(--ll-text-muted); font-size: 12px; border: 1px dashed rgba(255,255,255,.08); border-radius: 14px; margin-top: 24px; padding: 20px; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit {
  private readonly dashboardService = inject(DashboardDataService);
  protected data: DashboardData | null = null;
  protected loading = false;
  protected errorMessage = '';
  protected period = 'fy';

  protected readonly ageingBuckets = [
    { key: 'not-due', label: 'Not due' }, { key: '1-30', label: '1–30d' }, { key: '31-60', label: '31–60d' },
    { key: '61-90', label: '61–90d' }, { key: '90-plus', label: '90+d' },
  ];

  ngOnInit(): void { this.loadDashboard(); }

  protected loadDashboard(): void {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.dashboardService.getDashboard().subscribe({
        next: (data) => { this.data = data; this.loading = false; },
        error: (error: unknown) => { this.errorMessage = error instanceof Error ? error.message : 'The dashboard API could not be loaded.'; this.loading = false; },
      });
    } catch (error: unknown) {
      this.errorMessage = error instanceof Error ? error.message : 'Configure the company workspace to load live data.';
      this.loading = false;
    }
  }

  protected setPeriod(value: string): void { this.period = value; this.loadDashboard(); }

  protected money(paise: string): string {
    const value = Number(BigInt(paise || '0')) / 100;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }

  protected barHeight(value: string, max: number): number { return max <= 0 ? 0 : Math.max(3, (Number(BigInt(value || '0')) / max) * 100); }
  protected relativeBar(value: string, max: number): number { return max <= 0 ? 0 : Math.max(2, (Number(BigInt(value || '0')) / max) * 100); }
  protected ageingHeight(values: Record<string, string>, key: string, max: number): number { return this.barHeight(values[key] || '0', max); }
  protected shortMonth(value: string): string { return value.split(' ')[0]; }

  protected get kpis() {
    const k = this.data?.kpis;
    return [
      { label: 'Revenue', value: this.money(k?.revenuePaise ?? '0'), caption: 'Selected period', icon: 'revenue', subValue: `${k?.invoiceCount ?? '0'} invoices` },
      { label: 'Net profit', value: this.money(k?.netProfitPaise ?? '0'), caption: `${k?.netMarginPercent ?? '0'}% margin`, icon: 'profit', subValue: `Expenses ${this.money(k?.expensePaise ?? '0')}` },
      { label: 'Bank balance', value: this.money(k?.bankBalancePaise ?? '0'), caption: 'As of period end', icon: 'cash', subValue: `${k?.transactionCount ?? '0'} posted entries` },
      { label: 'Receivables', value: this.money(this.data?.receivables.totalOutstandingPaise ?? '0'), caption: 'Outstanding', icon: 'receivable', subValue: `${this.data?.receivables.invoiceCount ?? '0'} invoices` },
      { label: 'Payables', value: this.money(this.data?.payables.totalOutstandingPaise ?? '0'), caption: 'Outstanding', icon: 'payable', subValue: `${this.data?.payables.billCount ?? '0'} bills` },
      { label: 'Inventory', value: this.money(k?.inventoryPaise ?? '0'), caption: 'Valuation', icon: 'inventory', subValue: `Assets ${this.money(k?.assetsPaise ?? '0')}` },
    ];
  }

  protected get pnl() { return this.data?.charts.pnlTrend ?? []; }
  protected get cash() { return this.data?.charts.cashMovement ?? []; }
  protected get revenueMix() { return this.data?.charts.revenueMix ?? []; }
  protected get expenseMix() { return this.data?.charts.expenseMix ?? []; }
  protected get receivables() { return this.data?.charts.receivablesAgeing ?? {}; }
  protected get payables() { return this.data?.charts.payablesAgeing ?? {}; }
  protected get activity() { return this.data?.recentActivity ?? []; }
  protected get pnlMax() { return Math.max(1, ...this.pnl.flatMap((x) => [Number(BigInt(x.revenue_paise)), Number(BigInt(x.expense_paise)), Math.abs(Number(BigInt(x.profit_paise)))])); }
  protected get cashMax() { return Math.max(1, ...this.cash.flatMap((x) => [Number(BigInt(x.inflow_paise)), Number(BigInt(x.outflow_paise))])); }
  protected get revenueMixMax() { return Math.max(1, ...this.revenueMix.map((x) => Number(BigInt(x.amount_paise)))); }
  protected get expenseMixMax() { return Math.max(1, ...this.expenseMix.map((x) => Number(BigInt(x.amount_paise)))); }
  protected get receivablesMax() { return Math.max(1, ...Object.values(this.receivables).map((x) => Number(BigInt(x || '0')))); }
  protected get payablesMax() { return Math.max(1, ...Object.values(this.payables).map((x) => Number(BigInt(x || '0')))); }
  protected get balanceRows() {
    const k = this.data?.kpis;
    return [
      { label: 'Assets', raw: k?.assetsPaise ?? '0', value: this.money(k?.assetsPaise ?? '0') },
      { label: 'Liabilities', raw: k?.liabilitiesPaise ?? '0', value: this.money(k?.liabilitiesPaise ?? '0') },
      { label: 'Equity', raw: k?.equityPaise ?? '0', value: this.money(k?.equityPaise ?? '0') },
    ];
  }
  protected get balanceMax() { return Math.max(1, ...this.balanceRows.map((x) => Number(BigInt(x.raw)))); }
}
