import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ArrowUpRight, BarChart3, FileText, Landmark, LucideAngularModule, ReceiptIndianRupee, Wallet } from 'lucide-angular';

@Component({
  standalone: true,
  imports: [LucideAngularModule.pick({ ArrowUpRight, BarChart3, FileText, Landmark, ReceiptIndianRupee, Wallet })],
  template: `
    <section class="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="ll-eyebrow">Overview</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Business dashboard</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Your financial workspace, designed for clear decisions and reliable accounting data.</p>
        </div>
        <button type="button" class="ll-button-primary">
          <span>View reports</span>
          <lucide-icon [img]="ArrowUpRight" [size]="16"></lucide-icon>
        </button>
      </header>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (metric of metrics; track metric.label) {
          <article class="ll-card p-5">
            <div class="flex items-start justify-between gap-4">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/10 text-violet-300">
                <lucide-icon [img]="metric.icon" [size]="17"></lucide-icon>
              </span>
              <span class="text-xs text-[var(--ll-text-muted)]">{{ metric.period }}</span>
            </div>
            <p class="mt-5 text-xs font-medium text-[var(--ll-text-muted)]">{{ metric.label }}</p>
            <p class="mt-1 text-2xl font-semibold tracking-tight text-white">{{ metric.value }}</p>
            <div class="mt-3 h-1 overflow-hidden rounded-full bg-white/6">
              <span class="block h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" [style.width.%]="metric.progress"></span>
            </div>
          </article>
        }
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <article class="ll-card min-h-[360px] p-5 sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-white">Cash movement</p>
              <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Foundation chart surface for live accounting data.</p>
            </div>
            <button type="button" class="ll-button-secondary">Monthly</button>
          </div>
          <div class="mt-8 flex h-56 items-end gap-2 border-b border-l border-white/8 px-2 pb-0 sm:gap-4">
            @for (bar of bars; track $index) {
              <div class="flex h-full flex-1 items-end">
                <div class="w-full rounded-t-md bg-gradient-to-t from-violet-600/70 to-fuchsia-400/80 transition-all duration-300 hover:from-violet-500 hover:to-fuchsia-300" [style.height.%]="bar"></div>
              </div>
            }
          </div>
          <div class="mt-3 flex justify-between text-[11px] text-[var(--ll-text-muted)]">
            <span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
          </div>
        </article>

        <article class="ll-card p-5 sm:p-6">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-semibold text-white">Recent activity</p>
              <p class="mt-1 text-xs text-[var(--ll-text-muted)]">Latest workspace events.</p>
            </div>
            <lucide-icon [img]="BarChart3" class="text-[var(--ll-text-muted)]" [size]="18"></lucide-icon>
          </div>
          <div class="mt-6 space-y-5">
            @for (activity of activities; track activity.title) {
              <div class="flex gap-3">
                <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.55)]"></span>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-white">{{ activity.title }}</p>
                  <p class="mt-1 text-xs text-[var(--ll-text-muted)]">{{ activity.detail }}</p>
                </div>
              </div>
            }
          </div>
        </article>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  protected readonly ArrowUpRight = ArrowUpRight;
  protected readonly BarChart3 = BarChart3;
  protected readonly metrics = [
    { label: 'Revenue', value: '₹0.00', period: 'Current period', progress: 18, icon: ReceiptIndianRupee },
    { label: 'Receivables', value: '₹0.00', period: 'Outstanding', progress: 8, icon: Wallet },
    { label: 'Transactions', value: '0', period: 'This period', progress: 34, icon: FileText },
    { label: 'Bank balance', value: '₹0.00', period: 'Current', progress: 56, icon: Landmark },
  ];

  protected readonly bars = [34, 48, 42, 66, 54, 72, 61, 78, 68, 84, 73, 90];

  protected readonly activities = [
    { title: 'Workspace ready', detail: 'Connect the dashboard to live accounting data.' },
    { title: 'Tenant context', detail: 'Company-scoped navigation is ready for integration.' },
    { title: 'Reporting surface', detail: 'Charts and tables can now use shared theme tokens.' },
  ];
}
