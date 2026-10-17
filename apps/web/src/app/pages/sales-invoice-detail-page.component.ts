import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideArrowLeft, LucideCheckCircle2, LucideFileText, LucideRefreshCw, LucideSend, LucideAlertCircle } from '@lucide/angular';
import { catchError, finalize, of } from 'rxjs';

import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  partyId: string;
  partyCode: string;
  partyName: string;
  partyGstin: string | null;
  sellerGstin: string;
  placeOfSupplyStateCode: string;
  status: string;
  subtotalPaise: string;
  discountPaise: string;
  taxablePaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvoiceLine = {
  id: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: string;
  unitPricePaise: string;
  discountPaise: string;
  gstRateBps: number;
  taxablePaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
};

type JournalEntry = {
  journalEntryId: string;
  journalEntryNumber: string;
  journalEntryDate: string;
  journalStatus: string;
  postedAt: string | null;
};

@Component({
  selector: 'll-sales-invoice-detail-page',
  standalone: true,
  imports: [LucideAlertCircle, LucideArrowLeft, LucideCheckCircle2, LucideFileText, LucideRefreshCw, LucideSend],
  template: `
    <section class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button type="button" class="back-button" (click)="backToInvoices()"><svg lucideArrowLeft [size]="15"></svg>Back to invoices</button>
          @if (invoice()) {
            <div class="mt-5 flex items-center gap-3">
              <span class="icon-badge"><svg lucideFileText [size]="19"></svg></span>
              <div><p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Sales invoice</p><h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{{ invoice()!.invoiceNumber }}</h1></div>
            </div>
          } @else {
            <h1 class="mt-5 text-2xl font-semibold tracking-tight text-white">Invoice detail</h1>
          }
        </div>
        <button type="button" class="icon-button" [disabled]="loading()" aria-label="Refresh invoice" title="Refresh invoice" (click)="loadInvoice()"><svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg></button>
      </div>

      @if (errorMessage()) { <div class="mt-6 flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert"><svg lucideAlertCircle [size]="16"></svg><span>{{ errorMessage() }}</span></div> }
      @if (loading() && !invoice()) { <div class="mt-6 space-y-4"><div class="h-40 animate-pulse rounded-2xl bg-white/[0.035]"></div><div class="h-64 animate-pulse rounded-2xl bg-white/[0.035]"></div></div> }

      @if (invoice(); as currentInvoice) {
        <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <article class="card">
            <div class="flex flex-col gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="eyebrow">Customer</p>
                <h2 class="mt-1 text-lg font-semibold text-white">{{ currentInvoice.partyName }}</h2>
                <p class="mt-1 font-mono text-xs text-zinc-500">{{ currentInvoice.partyCode }}{{ currentInvoice.partyGstin ? ' · ' + currentInvoice.partyGstin : '' }}</p>
              </div>
              <span class="status" [class.status-issued]="currentInvoice.status === 'issued'">{{ currentInvoice.status === 'issued' ? 'Issued' : 'Draft' }}</span>
            </div>
            <div class="grid gap-4 border-b border-white/8 p-5 sm:grid-cols-3">
              <div><p class="eyebrow">Invoice date</p><p class="mt-1 text-sm text-zinc-200">{{ currentInvoice.invoiceDate }}</p></div>
              <div><p class="eyebrow">Due date</p><p class="mt-1 text-sm text-zinc-200">{{ currentInvoice.dueDate || '—' }}</p></div>
              <div><p class="eyebrow">Place of supply</p><p class="mt-1 font-mono text-sm text-zinc-200">{{ currentInvoice.placeOfSupplyStateCode }}</p></div>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><tr><th class="px-5 py-3 font-medium">Item</th><th class="px-5 py-3 font-medium">Qty</th><th class="px-5 py-3 font-medium">Rate</th><th class="px-5 py-3 font-medium">GST</th><th class="px-5 py-3 text-right font-medium">Total</th></tr></thead>
                <tbody class="divide-y divide-white/6">
                  @for (line of lines(); track line.id) {
                    <tr><td class="px-5 py-4"><p class="font-medium text-zinc-200">{{ line.itemName }}</p><p class="mt-1 text-[11px] text-zinc-500">{{ line.itemCode }} · {{ line.description }}</p></td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ line.quantity }}</td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ formatPaise(line.unitPricePaise) }}</td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ line.gstRateBps / 100 }}%</td><td class="whitespace-nowrap px-5 py-4 text-right text-xs font-medium text-zinc-200">{{ formatPaise(line.totalPaise) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="grid gap-2 border-t border-white/8 p-5 sm:ml-auto sm:max-w-sm">
              <div class="summary-row"><span>Subtotal</span><strong>{{ formatPaise(currentInvoice.subtotalPaise) }}</strong></div>
              <div class="summary-row"><span>Discount</span><strong>{{ formatPaise(currentInvoice.discountPaise) }}</strong></div>
              <div class="summary-row"><span>Taxable</span><strong>{{ formatPaise(currentInvoice.taxablePaise) }}</strong></div>
              @if (currentInvoice.cgstPaise !== '0') { <div class="summary-row"><span>CGST</span><strong>{{ formatPaise(currentInvoice.cgstPaise) }}</strong></div> }
              @if (currentInvoice.sgstPaise !== '0') { <div class="summary-row"><span>SGST</span><strong>{{ formatPaise(currentInvoice.sgstPaise) }}</strong></div> }
              @if (currentInvoice.igstPaise !== '0') { <div class="summary-row"><span>IGST</span><strong>{{ formatPaise(currentInvoice.igstPaise) }}</strong></div> }
              <div class="summary-total"><span>Total</span><strong>{{ formatPaise(currentInvoice.totalPaise) }}</strong></div>
            </div>
            @if (currentInvoice.notes) { <div class="border-t border-white/8 px-5 py-4"><p class="eyebrow">Notes</p><p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{{ currentInvoice.notes }}</p></div> }
          </article>

          <aside class="space-y-4">
            <article class="card p-5">
              <p class="eyebrow">Accounting</p>
              @if (journalEntry(); as journal) {
                <div class="mt-3 flex items-center gap-2 text-emerald-300"><svg lucideCheckCircle2 [size]="15"></svg><span class="text-sm font-medium">Posted to ledger</span></div>
                <dl class="mt-4 space-y-3 text-xs"><div><dt class="text-zinc-500">Journal</dt><dd class="mt-1 font-mono text-zinc-200">{{ journal.journalEntryNumber }}</dd></div><div><dt class="text-zinc-500">Entry date</dt><dd class="mt-1 text-zinc-300">{{ journal.journalEntryDate }}</dd></div><div><dt class="text-zinc-500">Posted at</dt><dd class="mt-1 text-zinc-300">{{ journal.postedAt || '—' }}</dd></div></dl>
              } @else {
                <p class="mt-3 text-sm leading-6 text-zinc-400">This invoice is still a draft and has no posted journal entry.</p>
                @if (currentInvoice.status === 'draft') { <div class="mt-4 flex items-center gap-2 text-xs text-amber-200"><svg lucideSend [size]="14"></svg>Issue it from the invoice workspace when sales posting accounts are configured.</div> }
              }
            </article>
            <article class="card p-5">
              <p class="eyebrow">GST</p>
              <dl class="mt-4 space-y-3 text-xs"><div><dt class="text-zinc-500">Seller GSTIN</dt><dd class="mt-1 font-mono text-zinc-200">{{ currentInvoice.sellerGstin }}</dd></div><div><dt class="text-zinc-500">Buyer GSTIN</dt><dd class="mt-1 font-mono text-zinc-200">{{ currentInvoice.partyGstin || 'Unregistered' }}</dd></div><div><dt class="text-zinc-500">Place of supply</dt><dd class="mt-1 font-mono text-zinc-200">{{ currentInvoice.placeOfSupplyStateCode }}</dd></div></dl>
            </article>
          </aside>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .back-button,.icon-button { font:inherit; }
    .back-button { display:inline-flex;align-items:center;gap:.4rem;color:#a1a1aa;font-size:.75rem;font-weight:600; }
    .back-button:hover { color:#fff; }
    .icon-button { display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border:1px solid rgba(255,255,255,.08);border-radius:.7rem;background:rgba(255,255,255,.025);color:#a1a1aa; }
    .icon-button:disabled { opacity:.5;cursor:not-allowed; }
    .icon-badge { display:flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border:1px solid rgba(167,139,250,.2);border-radius:.8rem;background:rgba(124,58,237,.1);color:#c4b5fd; }
    .card { overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:1rem;background:rgba(24,24,27,.72);box-shadow:0 18px 40px rgba(0,0,0,.12); }
    .eyebrow { color:#71717a;font-size:.65rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase; }
    .status { display:inline-flex;border:1px solid rgba(245,158,11,.16);border-radius:999px;background:rgba(245,158,11,.08);padding:.3rem .6rem;font-size:.68rem;color:#fcd34d; }
    .status-issued { border-color:rgba(74,222,128,.16);background:rgba(34,197,94,.08);color:#86efac; }
    .summary-row { display:flex;justify-content:space-between;gap:1rem;color:#71717a;font-size:.75rem; }
    .summary-row strong { color:#d4d4d8;font-weight:500; }
    .summary-total { display:flex;justify-content:space-between;gap:1rem;border-top:1px solid rgba(255,255,255,.08);padding-top:.7rem;color:#fff;font-size:.85rem;font-weight:700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesInvoiceDetailPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly lines = signal<InvoiceLine[]>([]);
  protected readonly journalEntry = signal<JournalEntry | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');

  constructor() { this.loadInvoice(); }

  protected loadInvoice(): void {
    const companyId = this.auth.selectedCompany()?.id;
    const invoiceId = this.route.snapshot.paramMap.get('invoiceId');
    if (!companyId || !invoiceId) { this.errorMessage.set('A company and invoice are required.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    this.http.get<{ invoice: Invoice; lines: InvoiceLine[]; journalEntry: JournalEntry | null }>(`${API_BASE_URL}/companies/${companyId}/sales/invoices/${invoiceId}`, { headers: this.headers() })
      .pipe(catchError((error) => { this.errorMessage.set(error?.error?.message || 'Unable to load invoice.'); return of(null); }), finalize(() => this.loading.set(false)))
      .subscribe((result) => { if (!result) return; this.invoice.set(result.invoice); this.lines.set(result.lines ?? []); this.journalEntry.set(result.journalEntry); });
  }

  protected backToInvoices(): void { void this.router.navigate(['/sales/invoices']); }
  protected formatPaise(value: string): string { const paise = Number(value); return Number.isFinite(paise) ? `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'; }
  private headers(): HttpHeaders { const token = this.auth.getAccessToken(); return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders(); }
}
