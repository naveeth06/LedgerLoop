import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideAlertCircle, LucideBell, LucideCheck, LucideCheckCircle2, LucideClock3, LucideMail, LucideRefreshCw, LucideSave } from '@lucide/angular';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type ReminderSettings = { enabled: boolean; firstAfterDays: number; repeatEveryDays: number; maxReminders: number };
type ReminderEvent = { id: string; invoiceId: string; invoiceNumber: string; partyName: string; partyEmail: string | null; reminderSequence: number; dueDate: string; outstandingPaise: string; status: 'pending' | 'acknowledged' | string; createdAt: string; acknowledgedAt: string | null };
type DeliveryCounts = { pending: number; processing: number; sent: number; failed: number; cancelled: number };

@Component({
  selector: 'll-reminders-page',
  standalone: true,
  imports: [FormsModule, LucideAlertCircle, LucideBell, LucideCheck, LucideCheckCircle2, LucideClock3, LucideMail, LucideRefreshCw, LucideSave],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div class="flex items-center gap-3"><span class="icon amber"><svg lucideBell [size]="19"></svg></span><div><p class="eyebrow">Collections</p><h1>Reminders</h1></div></div><p class="intro">Control overdue invoice reminders, review generated events, and monitor email delivery without changing accounting state.</p></div>
        <button class="secondary" type="button" [disabled]="loading()" (click)="loadWorkspace()"><svg lucideRefreshCw [size]="15" [class.animate-spin]="loading()"></svg>Refresh</button>
      </header>
      @if (errorMessage()) { <div class="notice error" role="alert"><svg lucideAlertCircle [size]="16"></svg>{{ errorMessage() }}</div> }
      @if (successMessage()) { <div class="notice success" role="status"><svg lucideCheckCircle2 [size]="16"></svg>{{ successMessage() }}</div> }

      <div class="kpis">
        <article><span class="kpi-icon amber"><svg lucideBell [size]="15"></svg></span><p>Reminder events</p><strong>{{ events().length }}</strong><small>{{ pendingCount() }} pending</small></article>
        <article><span class="kpi-icon blue"><svg lucideMail [size]="15"></svg></span><p>Emails sent</p><strong>{{ deliveries().sent }}</strong><small>delivery records</small></article>
        <article><span class="kpi-icon rose"><svg lucideAlertCircle [size]="15"></svg></span><p>Failed emails</p><strong>{{ deliveries().failed }}</strong><small>needs attention</small></article>
        <article><span class="kpi-icon violet"><svg lucideClock3 [size]="15"></svg></span><p>Queued</p><strong>{{ deliveries().pending + deliveries().processing }}</strong><small>pending / processing</small></article>
        <article><span class="kpi-icon emerald"><svg lucideCheckCircle2 [size]="15"></svg></span><p>Reminder policy</p><strong>{{ settings().enabled ? 'On' : 'Off' }}</strong><small>{{ settings().maxReminders }} max reminders</small></article>
      </div>

      <div class="layout">
        <section class="panel">
          <div class="panel-head"><div><h2>Overdue reminder events</h2><p>Backend-generated events; acknowledgement only records that your team has seen them.</p></div><span class="pill">{{ pendingCount() }} pending</span></div>
          @if (loading() && events().length === 0) { <div class="skeletons">@for (row of [1,2,3,4]; track row) { <div></div> }</div> }
          @else if (events().length === 0) { <div class="empty"><svg lucideCheckCircle2 [size]="22"></svg><h3>No reminder events</h3><p>When an eligible invoice becomes overdue, generated reminder events will appear here.</p></div> }
          @else { <div class="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Outstanding</th><th>Reminder</th><th>Status</th><th></th></tr></thead><tbody>@for (event of events(); track event.id) { <tr><td><strong>{{ event.invoiceNumber }}</strong><small>{{ event.createdAt }}</small></td><td><strong>{{ event.partyName }}</strong><small>{{ event.partyEmail || 'No email' }}</small></td><td>{{ event.dueDate }}</td><td>{{ formatPaise(event.outstandingPaise) }}</td><td><span class="pill">#{{ event.reminderSequence }}</span></td><td><span class="status" [class.pending]="event.status === 'pending'" [class.acknowledged]="event.status === 'acknowledged'">{{ event.status }}</span></td><td>@if (event.status === 'pending') { <button class="action" type="button" [disabled]="acknowledgingId() === event.id" (click)="acknowledge(event)"><svg lucideCheck [size]="13"></svg>{{ acknowledgingId() === event.id ? 'Saving…' : 'Acknowledge' }}</button> } @else { <span class="seen">Seen</span> }</td></tr>}</tbody></table></div> }
        </section>

        <aside>
          <section class="panel settings"><div class="section-title"><span class="icon amber"><svg lucideBell [size]="16"></svg></span><div><h2>Reminder policy</h2><p>Owner/admin settings</p></div></div><form (ngSubmit)="saveSettings()">
            <label class="switch-row"><span><b>Enable reminders</b><small>Allow the scheduler to generate overdue events.</small></span><input type="checkbox" name="enabled" [(ngModel)]="settingsDraft.enabled" /></label>
            <label>First reminder after (days)<input class="input" type="number" min="1" max="365" name="firstAfterDays" [(ngModel)]="settingsDraft.firstAfterDays" /></label>
            <label>Repeat every (days)<input class="input" type="number" min="1" max="365" name="repeatEveryDays" [(ngModel)]="settingsDraft.repeatEveryDays" /></label>
            <label>Maximum reminders<input class="input" type="number" min="1" max="20" name="maxReminders" [(ngModel)]="settingsDraft.maxReminders" /></label>
            <button class="primary" type="submit" [disabled]="savingSettings()"><svg lucideSave [size]="14"></svg>{{ savingSettings() ? 'Saving…' : 'Save reminder policy' }}</button>
          </form></section>
          <section class="panel delivery"><div class="section-title"><span class="icon blue"><svg lucideMail [size]="16"></svg></span><div><h2>Email delivery</h2><p>Provider-neutral delivery queue</p></div></div>@for (row of deliveryRows; track row.key) { <div class="delivery-row"><span>{{ row.label }}</span><b>{{ deliveries()[row.key] }}</b></div> }<p class="footnote">This screen reports delivery state only. Provider-specific webhooks remain outside this workflow until a provider is explicitly selected.</p></section>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block}.icon{display:flex;width:2.5rem;height:2.5rem;align-items:center;justify-content:center;border-radius:.75rem}.amber{color:#fbbf24;background:rgba(245,158,11,.1)}.blue{color:#7dd3fc;background:rgba(14,165,233,.1)}.rose{color:#fda4af;background:rgba(244,63,94,.1)}.violet{color:#c4b5fd;background:rgba(139,92,246,.1)}.emerald{color:#6ee7b7;background:rgba(16,185,129,.1)}
    header{margin-bottom:1.5rem}.eyebrow{margin:0;color:#fbbf24;font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em}h1{margin:.25rem 0 0;color:#fff;font-size:clamp(1.6rem,3vw,2.1rem);font-weight:650;letter-spacing:-.03em}.intro{max-width:46rem;margin:1rem 0 0;color:var(--ll-text-muted);font-size:.82rem;line-height:1.6}
    .secondary,.primary,.action{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border-radius:.7rem;font:inherit;font-size:.72rem;font-weight:600;cursor:pointer}.secondary{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:.6rem .8rem;color:#d4d4d8}.primary{width:100%;border:1px solid rgba(245,158,11,.32);background:rgba(245,158,11,.14);padding:.65rem .8rem;color:#fff}.action{border:1px solid rgba(52,211,153,.24);background:rgba(16,185,129,.09);padding:.45rem .65rem;color:#a7f3d0}.secondary:hover:not(:disabled){background:rgba(255,255,255,.06)}.primary:hover:not(:disabled){background:rgba(245,158,11,.21)}button:disabled{opacity:.5;cursor:not-allowed}
    .notice{display:flex;align-items:center;gap:.55rem;margin:1rem 0;padding:.75rem .9rem;border-radius:.75rem;font-size:.75rem}.error{border:1px solid rgba(251,113,133,.2);background:rgba(244,63,94,.08);color:#fecdd3}.success{border:1px solid rgba(52,211,153,.2);background:rgba(16,185,129,.08);color:#a7f3d0}
    .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1rem}.kpis article{border:1px solid rgba(255,255,255,.08);border-radius:1rem;background:rgba(255,255,255,.025);padding:1rem}.kpi-icon{display:flex;width:2rem;height:2rem;align-items:center;justify-content:center;border-radius:.6rem}.kpis p{margin:.7rem 0 0;color:#a1a1aa;font-size:.67rem}.kpis strong{display:block;margin:.4rem 0 0;color:#fff;font-size:1.25rem}.kpis small{display:block;margin-top:.3rem;color:#71717a;font-size:.62rem}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:1.25rem;margin-top:1.25rem}.panel{overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:1rem;background:rgba(15,15,18,.72);box-shadow:0 20px 40px rgba(0,0,0,.08)}.panel-head,.section-title{display:flex;align-items:center;justify-content:space-between;gap:1rem}.panel-head{padding:1.1rem 1.2rem;border-bottom:1px solid rgba(255,255,255,.08)}h2{margin:0;color:#fff;font-size:.82rem;font-weight:600}.panel-head p,.section-title p{margin:.3rem 0 0;color:#71717a;font-size:.64rem;line-height:1.5}.section-title{justify-content:flex-start}.settings,.delivery{padding:1.1rem}.settings form{display:grid;gap:.85rem;margin-top:1rem}.settings label{display:grid;gap:.35rem;color:#a1a1aa;font-size:.65rem;font-weight:600}.input{width:100%;border:1px solid rgba(255,255,255,.1);border-radius:.65rem;background:rgba(255,255,255,.035);padding:.6rem .7rem;color:#e4e4e7;font:inherit;font-size:.72rem;outline:none}.input:focus{border-color:rgba(251,191,36,.45);box-shadow:0 0 0 3px rgba(245,158,11,.08)}.switch-row{display:flex!important;grid-template-columns:none!important;align-items:center;justify-content:space-between;gap:.8rem;padding:.7rem;border:1px solid rgba(255,255,255,.08);border-radius:.75rem;background:rgba(255,255,255,.02)}.switch-row b,.switch-row small{display:block}.switch-row b{color:#e4e4e7;font-size:.68rem}.switch-row small{margin-top:.25rem;color:#71717a;font-size:.6rem;font-weight:400}.switch-row input{width:2.2rem;height:1.25rem;accent-color:#f59e0b}.delivery{margin-top:1.25rem}.delivery-row{display:flex;align-items:center;justify-content:space-between;margin-top:.55rem;padding:.6rem .7rem;border:1px solid rgba(255,255,255,.06);border-radius:.65rem;background:rgba(255,255,255,.02);color:#a1a1aa;font-size:.67rem}.delivery-row b{color:#e4e4e7}.footnote{margin:.85rem 0 0;color:#52525b;font-size:.6rem;line-height:1.5}
    .table-scroll{overflow-x:auto}table{width:100%;min-width:820px;border-collapse:collapse;text-align:left;font-size:.7rem}th{padding:.75rem 1rem;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.015);color:#71717a;font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}td{padding:.8rem 1rem;border-bottom:1px solid rgba(255,255,255,.055);color:#a1a1aa;vertical-align:middle}tbody tr:hover{background:rgba(255,255,255,.02)}td strong{display:block;color:#e4e4e7;font-weight:500}td small{display:block;margin-top:.25rem;color:#52525b;font-size:.58rem}.pill,.status{display:inline-flex;align-items:center;border-radius:999px;padding:.28rem .5rem;font-size:.6rem}.pill{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#a1a1aa}.status{background:rgba(255,255,255,.04);color:#a1a1aa;text-transform:capitalize}.status.pending{background:rgba(245,158,11,.1);color:#fcd34d}.status.acknowledged{background:rgba(16,185,129,.1);color:#6ee7b7}.seen{color:#6ee7b7;font-size:.65rem}.empty{padding:4rem 1.5rem;text-align:center;color:#52525b}.empty h3{margin:.7rem 0 .35rem;color:#e4e4e7;font-size:.8rem}.empty p{max-width:28rem;margin:0 auto;color:#71717a;font-size:.7rem;line-height:1.6}.skeletons{display:grid;gap:.7rem;padding:1rem}.skeletons div{height:3.5rem;border-radius:.7rem;background:rgba(255,255,255,.035)}
    @media (max-width:1100px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.layout{grid-template-columns:1fr}}@media (max-width:640px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpis article:last-child{grid-column:1/-1}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemindersPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly settings = signal<ReminderSettings>({ enabled: false, firstAfterDays: 1, repeatEveryDays: 7, maxReminders: 3 });
  protected readonly events = signal<ReminderEvent[]>([]);
  protected readonly deliveries = signal<DeliveryCounts>({ pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 });
  protected readonly loading = signal(false);
  protected readonly savingSettings = signal(false);
  protected readonly acknowledgingId = signal('');
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected settingsDraft: ReminderSettings = { enabled: false, firstAfterDays: 1, repeatEveryDays: 7, maxReminders: 3 };
  protected readonly deliveryRows: Array<{ key: keyof DeliveryCounts; label: string }> = [
    { key: 'pending', label: 'Pending' }, { key: 'processing', label: 'Processing' }, { key: 'sent', label: 'Sent' }, { key: 'failed', label: 'Failed' }, { key: 'cancelled', label: 'Cancelled' },
  ];

  constructor() { this.loadWorkspace(); }

  protected loadWorkspace(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) { this.errorMessage.set('Select a company before opening reminders.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    forkJoin({
      settings: this.http.get<ReminderSettings>(`${API_BASE_URL}/companies/${companyId}/reminders/settings`).pipe(catchError(() => of(null))),
      events: this.http.get<{ events?: ReminderEvent[] }>(`${API_BASE_URL}/companies/${companyId}/reminders/events`).pipe(catchError(() => of({ events: [] }))),
      deliveries: this.http.get<{ counts?: DeliveryCounts }>(`${API_BASE_URL}/companies/${companyId}/reminders/deliveries/summary`).pipe(catchError(() => of({ counts: undefined }))),
    }).pipe(finalize(() => this.loading.set(false))).subscribe(({ settings, events, deliveries }) => {
      if (settings) { this.settings.set(settings); this.settingsDraft = { ...settings }; }
      this.events.set(events.events ?? []); this.deliveries.set(deliveries.counts ?? { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 });
    });
  }

  protected saveSettings(): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
    const payload = { ...this.settingsDraft, firstAfterDays: Number(this.settingsDraft.firstAfterDays), repeatEveryDays: Number(this.settingsDraft.repeatEveryDays), maxReminders: Number(this.settingsDraft.maxReminders) };
    this.savingSettings.set(true); this.errorMessage.set(''); this.successMessage.set('');
    this.http.put<ReminderSettings>(`${API_BASE_URL}/companies/${companyId}/reminders/settings`, payload).pipe(finalize(() => this.savingSettings.set(false))).subscribe({ next: (settings) => { this.settings.set(settings); this.settingsDraft = { ...settings }; this.successMessage.set('Reminder policy saved.'); }, error: (error) => this.errorMessage.set(error?.error?.message || 'Unable to save reminder policy.') });
  }

  protected acknowledge(event: ReminderEvent): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
    this.acknowledgingId.set(event.id); this.errorMessage.set(''); this.successMessage.set('');
    this.http.post(`${API_BASE_URL}/companies/${companyId}/reminders/events/${event.id}/acknowledge`, {}).pipe(finalize(() => this.acknowledgingId.set(''))).subscribe({ next: () => { this.events.update((items) => items.map((item) => item.id === event.id ? { ...item, status: 'acknowledged', acknowledgedAt: new Date().toISOString() } : item)); this.successMessage.set(`Reminder for ${event.invoiceNumber} acknowledged.`); }, error: (error) => this.errorMessage.set(error?.error?.message || 'Unable to acknowledge reminder event.') });
  }

  protected pendingCount(): number { return this.events().filter((event) => event.status === 'pending').length; }
  protected formatPaise(value: string): string { const amount = BigInt(value || '0'); const negative = amount < 0n; const absolute = negative ? -amount : amount; const rupees = absolute / 100n; const paise = absolute % 100n; return `${negative ? '-' : ''}₹${rupees.toLocaleString('en-IN')}.${paise.toString().padStart(2, '0')}`; }
}
