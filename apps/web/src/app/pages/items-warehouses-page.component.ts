import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import {
  LucideBoxes,
  LucidePlus,
  LucideRefreshCw,
  LucideSearch,
  LucideWarehouse,
} from '@lucide/angular';
import { API_BASE_URL } from '../services/api-base-url';
import { AuthService } from '../services/auth.service';

type ItemType = 'goods' | 'service';
type ViewMode = 'items' | 'warehouses';

type Item = {
  id: string;
  item_code: string;
  name: string;
  item_type: ItemType;
  hsn_sac: string | null;
  unit_code: string;
  gst_rate_bps: number;
  selling_price_paise: string;
  purchase_price_paise: string;
  track_inventory: boolean;
  is_active: boolean;
};

type Warehouse = {
  id: string;
  warehouse_code: string;
  name: string;
  branch_id: string | null;
  address: Record<string, unknown>;
  is_active: boolean;
};

@Component({
  selector: 'll-items-warehouses-page',
  standalone: true,
  imports: [LucideBoxes, LucidePlus, LucideRefreshCw, LucideSearch, LucideWarehouse],
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              @if (viewMode() === 'items') { <svg lucideBoxes [size]="19"></svg> } @else { <svg lucideWarehouse [size]="19"></svg> }
            </span>
            <div>
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">Masters</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Items & Warehouses</h1>
            </div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">
            Maintain the goods, services, and stock locations used by sales, purchases, and inventory workflows.
          </p>
        </div>
        <button type="button" class="ll-primary-button shrink-0" (click)="openCreateForm()">
          <svg lucidePlus [size]="16"></svg>
          {{ viewMode() === 'items' ? 'New item' : 'New warehouse' }}
        </button>
      </div>

      @if (errorMessage()) {
        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          <span>{{ errorMessage() }}</span>
          <button type="button" class="rounded-lg px-2 py-1 text-xs font-medium text-rose-100 hover:bg-white/5" (click)="loadCurrentView()">Retry</button>
        </div>
      }

      <div class="mt-6 rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div class="flex rounded-xl border border-white/8 bg-white/[0.025] p-1">
            <button type="button" class="ll-tab" [class.ll-tab-active]="viewMode() === 'items'" (click)="switchView('items')">
              <svg lucideBoxes [size]="15"></svg> Items
            </button>
            <button type="button" class="ll-tab" [class.ll-tab-active]="viewMode() === 'warehouses'" (click)="switchView('warehouses')">
              <svg lucideWarehouse [size]="15"></svg> Warehouses
            </button>
          </div>
          <div class="flex items-center gap-2">
            <label class="relative block min-w-0 sm:w-72">
              <span class="sr-only">Search</span>
              <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg>
              <input class="ll-input w-full pl-9" type="search" [placeholder]="viewMode() === 'items' ? 'Search code or item name' : 'Search code or warehouse name'" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" />
            </label>
            @if (viewMode() === 'items') {
              <select class="ll-input text-xs" [value]="itemTypeFilter()" (change)="itemTypeFilter.set($any($event.target).value); loadCurrentView()">
                <option value="all">All types</option><option value="goods">Goods</option><option value="service">Services</option>
              </select>
            }
            <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh" (click)="loadCurrentView()">
              <svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg>
            </button>
          </div>
        </div>

        @if (loading() && currentRows().length === 0) {
          <div class="space-y-3 p-5">@for (row of [1,2,3,4,5,6]; track row) { <div class="h-14 animate-pulse rounded-xl bg-white/[0.035]"></div> }</div>
        } @else if (filteredRows().length === 0) {
          <div class="px-6 py-16 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500">
              @if (viewMode() === 'items') { <svg lucideBoxes [size]="20"></svg> } @else { <svg lucideWarehouse [size]="20"></svg> }
            </div>
            <h2 class="mt-4 text-sm font-semibold text-white">{{ currentRows().length ? 'No matching records' : (viewMode() === 'items' ? 'No items yet' : 'No warehouses yet') }}</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">Create the master data needed for the next sales, purchases, and inventory workflows.</p>
            @if (!currentRows().length) { <button type="button" class="ll-primary-button mt-5" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>{{ viewMode() === 'items' ? 'New item' : 'New warehouse' }}</button> }
          </div>
        } @else if (viewMode() === 'items') {
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><tr>
                <th class="px-5 py-3.5 font-medium">Item</th><th class="px-5 py-3.5 font-medium">Type</th><th class="px-5 py-3.5 font-medium">HSN / SAC</th><th class="px-5 py-3.5 font-medium">GST</th><th class="px-5 py-3.5 font-medium">Selling price</th><th class="px-5 py-3.5 font-medium">Inventory</th><th class="px-5 py-3.5 font-medium">Status</th>
              </tr></thead>
              <tbody class="divide-y divide-white/6">
                @for (item of filteredItems(); track item.id) { <tr class="transition hover:bg-white/[0.025]">
                  <td class="min-w-56 px-5 py-4"><p class="font-medium text-white">{{ item.name }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ item.item_code }}</p></td>
                  <td class="whitespace-nowrap px-5 py-4"><span class="ll-type">{{ item.item_type === 'goods' ? 'Goods' : 'Service' }}</span></td>
                  <td class="px-5 py-4 font-mono text-xs text-zinc-400">{{ item.hsn_sac || '—' }}</td>
                  <td class="px-5 py-4 text-xs text-zinc-300">{{ item.gst_rate_bps / 100 }}%</td>
                  <td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-300">{{ formatPaise(item.selling_price_paise) }}</td>
                  <td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ item.track_inventory ? 'Tracked' : 'Not tracked' }}</td>
                  <td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!item.is_active">{{ item.is_active ? 'Active' : 'Inactive' }}</span></td>
                </tr> }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="overflow-x-auto"><table class="min-w-full text-left text-sm">
            <thead class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><tr>
              <th class="px-5 py-3.5 font-medium">Warehouse</th><th class="px-5 py-3.5 font-medium">Branch</th><th class="px-5 py-3.5 font-medium">Address</th><th class="px-5 py-3.5 font-medium">Status</th>
            </tr></thead>
            <tbody class="divide-y divide-white/6">
              @for (warehouse of filteredWarehouses(); track warehouse.id) { <tr class="transition hover:bg-white/[0.025]">
                <td class="min-w-64 px-5 py-4"><p class="font-medium text-white">{{ warehouse.name }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ warehouse.warehouse_code }}</p></td>
                <td class="px-5 py-4 font-mono text-xs text-zinc-500">{{ warehouse.branch_id || '—' }}</td>
                <td class="max-w-md px-5 py-4 text-xs text-zinc-400">{{ addressSummary(warehouse.address) }}</td>
                <td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!warehouse.is_active">{{ warehouse.is_active ? 'Active' : 'Inactive' }}</span></td>
              </tr> }
            </tbody>
          </table></div>
        }
        @if (currentRows().length) { <div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">Showing {{ filteredRows().length }} of {{ currentRows().length }} records</div> }
      </div>
    </section>

    @if (createFormOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeCreateForm()">
        <section class="w-full max-w-2xl rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4"><div><p class="text-xs font-medium uppercase tracking-[0.14em] text-violet-300">{{ viewMode() === 'items' ? 'Item master' : 'Warehouse master' }}</p><h2 class="mt-1 text-lg font-semibold text-white">Create {{ viewMode() === 'items' ? 'item' : 'warehouse' }}</h2></div><button type="button" class="ll-icon-button" aria-label="Close" (click)="closeCreateForm()">×</button></div>
          @if (viewMode() === 'items') {
            <form class="mt-5 space-y-4" (submit)="createItem($event)">
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Item code</span><input class="ll-input mt-1.5 w-full" required maxlength="32" [value]="itemCode()" (input)="itemCode.set($any($event.target).value)" placeholder="ITEM-001" /></label><label><span class="ll-label">Type</span><select class="ll-input mt-1.5 w-full" [value]="itemType()" (change)="itemType.set($any($event.target).value)"><option value="goods">Goods</option><option value="service">Service</option></select></label></div>
              <label><span class="ll-label">Name</span><input class="ll-input mt-1.5 w-full" required maxlength="200" [value]="itemName()" (input)="itemName.set($any($event.target).value)" placeholder="Product or service name" /></label>
              <div class="grid gap-4 sm:grid-cols-3"><label><span class="ll-label">HSN / SAC</span><input class="ll-input mt-1.5 w-full" maxlength="8" inputmode="numeric" [value]="hsnSac()" (input)="hsnSac.set($any($event.target).value)" placeholder="9983" /></label><label><span class="ll-label">Unit</span><input class="ll-input mt-1.5 w-full" maxlength="16" [value]="unitCode()" (input)="unitCode.set($any($event.target).value)" /></label><label><span class="ll-label">GST %</span><input class="ll-input mt-1.5 w-full" type="number" min="0" max="100" step="0.01" [value]="gstRate()" (input)="gstRate.set($any($event.target).value)" /></label></div>
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Selling price (₹)</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="sellingPrice()" (input)="sellingPrice.set($any($event.target).value)" placeholder="0.00" /></label><label><span class="ll-label">Purchase price (₹)</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="purchasePrice()" (input)="purchasePrice.set($any($event.target).value)" placeholder="0.00" /></label></div>
              @if (itemType() === 'goods') { <label class="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" [checked]="trackInventory()" (change)="trackInventory.set($any($event.target).checked)" /> Track inventory for this item</label> }
              @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{{ formError() }}</p> }
              <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-secondary-button" (click)="closeCreateForm()">Cancel</button><button type="submit" class="ll-primary-button" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create item' }}</button></div>
            </form>
          } @else {
            <form class="mt-5 space-y-4" (submit)="createWarehouse($event)">
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Warehouse code</span><input class="ll-input mt-1.5 w-full" required maxlength="32" [value]="warehouseCode()" (input)="warehouseCode.set($any($event.target).value)" placeholder="WH-001" /></label><label><span class="ll-label">Name</span><input class="ll-input mt-1.5 w-full" required maxlength="160" [value]="warehouseName()" (input)="warehouseName.set($any($event.target).value)" placeholder="Main warehouse" /></label></div>
              <label><span class="ll-label">Branch ID <span class="font-normal text-zinc-600">(optional)</span></span><input class="ll-input mt-1.5 w-full font-mono" [value]="branchId()" (input)="branchId.set($any($event.target).value)" placeholder="UUID" /></label>
              <label><span class="ll-label">Address <span class="font-normal text-zinc-600">(optional)</span></span><textarea class="ll-input mt-1.5 min-h-24 w-full" [value]="warehouseAddress()" (input)="warehouseAddress.set($any($event.target).value)" placeholder="12 Industrial Estate, Salem"></textarea></label>
              @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{{ formError() }}</p> }
              <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-secondary-button" (click)="closeCreateForm()">Cancel</button><button type="submit" class="ll-primary-button" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create warehouse' }}</button></div>
            </form>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .ll-primary-button,.ll-secondary-button,.ll-icon-button,.ll-input { font: inherit; }
    .ll-primary-button { display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:1px solid rgba(167,139,250,.35);border-radius:.75rem;background:rgba(124,58,237,.18);padding:.65rem .9rem;color:#fff;font-size:.75rem;font-weight:600;transition:.15s; }
    .ll-primary-button:hover:not(:disabled){background:rgba(124,58,237,.28);border-color:rgba(167,139,250,.55)} .ll-primary-button:disabled{opacity:.5;cursor:not-allowed}
    .ll-secondary-button { border:1px solid rgba(255,255,255,.1);border-radius:.75rem;background:rgba(255,255,255,.03);padding:.65rem .9rem;color:#d4d4d8;font-size:.75rem;font-weight:600; }
    .ll-icon-button { display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border:1px solid rgba(255,255,255,.08);border-radius:.7rem;background:rgba(255,255,255,.025);color:#a1a1aa; }
    .ll-input { border:1px solid rgba(255,255,255,.1);border-radius:.7rem;background:rgba(255,255,255,.035);padding:.65rem .75rem;color:#e4e4e7;font-size:.75rem;outline:none; }
    .ll-input:focus { border-color:rgba(167,139,250,.5);box-shadow:0 0 0 3px rgba(124,58,237,.1); }
    .ll-input option { background:#18181b;color:#fff; }
    .ll-label { display:block;color:#a1a1aa;font-size:.7rem;font-weight:600; }
    .ll-tab { display:inline-flex;align-items:center;gap:.4rem;border-radius:.55rem;padding:.5rem .75rem;color:#a1a1aa;font-size:.72rem;font-weight:600;transition:.15s; }
    .ll-tab-active { background:rgba(124,58,237,.16);color:#e9d5ff; }
    .ll-type { display:inline-flex;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:.25rem .55rem;font-size:.68rem;color:#d4d4d8;background:rgba(255,255,255,.025); }
    .ll-status { display:inline-flex;border:1px solid rgba(74,222,128,.16);border-radius:999px;background:rgba(34,197,94,.08);padding:.25rem .55rem;font-size:.68rem;color:#86efac; }
    .ll-status-inactive { border-color:rgba(244,63,94,.16);background:rgba(244,63,94,.08);color:#fda4af; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemsWarehousesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  protected readonly viewMode = signal<ViewMode>('items');
  protected readonly items = signal<Item[]>([]);
  protected readonly warehouses = signal<Warehouse[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly formError = signal('');
  protected readonly searchTerm = signal('');
  protected readonly itemTypeFilter = signal<'all' | ItemType>('all');
  protected readonly createFormOpen = signal(false);

  protected readonly itemCode = signal('');
  protected readonly itemName = signal('');
  protected readonly itemType = signal<ItemType>('goods');
  protected readonly hsnSac = signal('');
  protected readonly unitCode = signal('unit');
  protected readonly gstRate = signal('0');
  protected readonly sellingPrice = signal('0');
  protected readonly purchasePrice = signal('0');
  protected readonly trackInventory = signal(true);
  protected readonly warehouseCode = signal('');
  protected readonly warehouseName = signal('');
  protected readonly branchId = signal('');
  protected readonly warehouseAddress = signal('');

  constructor() { this.loadCurrentView(); }

  protected currentRows(): Array<Item | Warehouse> { return this.viewMode() === 'items' ? this.items() : this.warehouses(); }
  protected filteredRows(): Array<Item | Warehouse> { const q = this.searchTerm().trim().toLowerCase(); if (!q) return this.currentRows(); return this.currentRows().filter(row => this.viewMode() === 'items' ? `${(row as Item).item_code} ${(row as Item).name}`.toLowerCase().includes(q) : `${(row as Warehouse).warehouse_code} ${(row as Warehouse).name}`.toLowerCase().includes(q)); }
  protected filteredItems(): Item[] { return this.filteredRows() as Item[]; }
  protected filteredWarehouses(): Warehouse[] { return this.filteredRows() as Warehouse[]; }

  protected switchView(mode: ViewMode): void { if (this.viewMode() === mode) return; this.viewMode.set(mode); this.searchTerm.set(''); this.formError.set(''); this.loadCurrentView(); }
  protected loadCurrentView(): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) { this.errorMessage.set('Select a company before loading master data.'); return; }
    this.loading.set(true); this.errorMessage.set('');
    const endpoint = this.viewMode() === 'items' ? `/companies/${companyId}/items` : `/companies/${companyId}/warehouses`;
    const options = this.viewMode() === 'items' && this.itemTypeFilter() !== 'all' ? { headers: this.headers(), params: { type: this.itemTypeFilter() } } : { headers: this.headers() };
    this.http.get<{ items?: Item[]; warehouses?: Warehouse[] }>(`${API_BASE_URL}${endpoint}`, options).pipe(catchError(error => { this.errorMessage.set(error?.error?.message || 'Unable to load master data.'); return of({items :[]as Item[], warehouses :[]as Warehouse[]}); }), finalize(() => this.loading.set(false))).subscribe(response => { if (this.viewMode() === 'items') this.items.set(response.items ?? []); else this.warehouses.set(response.warehouses ?? []); });
  }

  protected openCreateForm(): void { this.formError.set(''); this.createFormOpen.set(true); }
  protected closeCreateForm(): void { if (!this.saving()) this.createFormOpen.set(false); }

  protected createItem(event: Event): void {
    event.preventDefault(); this.formError.set('');
    const itemCode = this.itemCode().trim(), name = this.itemName().trim();
    const gst = Number(this.gstRate()), sell = this.toPaise(this.sellingPrice()), purchase = this.toPaise(this.purchasePrice());
    if (!itemCode || !name || !Number.isFinite(gst) || gst < 0 || gst > 100 || sell === null || purchase === null) { this.formError.set('Enter valid item details, prices, and GST rate.'); return; }
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) { this.formError.set('Select a company first.'); return; }
    this.saving.set(true);
    const body = { itemCode, name, itemType: this.itemType(), hsnSac: this.hsnSac().trim() || undefined, unitCode: this.unitCode().trim() || 'unit', gstRateBps: Math.round(gst * 100), sellingPricePaise: sell, purchasePricePaise: purchase, trackInventory: this.itemType() === 'goods' ? this.trackInventory() : false };
    this.http.post(`${API_BASE_URL}/companies/${companyId}/items`, body, { headers: this.headers() }).pipe(catchError(error => { this.formError.set(error?.error?.message || 'Unable to create item.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe(result => { if (!result) return; this.closeCreateForm(); this.loadCurrentView(); });
  }

  protected createWarehouse(event: Event): void {
    event.preventDefault(); this.formError.set(''); const code = this.warehouseCode().trim(), name = this.warehouseName().trim();
    if (!code || !name) { this.formError.set('Warehouse code and name are required.'); return; }
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) { this.formError.set('Select a company first.'); return; }
    let address: Record<string, string> = {}; const text = this.warehouseAddress().trim(); if (text) address = { line1: text };
    this.saving.set(true); const body = { warehouseCode: code, name, branchId: this.branchId().trim() || undefined, address };
    this.http.post(`${API_BASE_URL}/companies/${companyId}/warehouses`, body, { headers: this.headers() }).pipe(catchError(error => { this.formError.set(error?.error?.message || 'Unable to create warehouse.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe(result => { if (!result) return; this.closeCreateForm(); this.loadCurrentView(); });
  }

  protected formatPaise(value: string): string { const paise = Number(value); return Number.isFinite(paise) ? `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'; }
  protected addressSummary(address: Record<string, unknown>): string { return Object.values(address ?? {}).filter(Boolean).map(String).join(', ') || '—'; }
  private toPaise(value: string): string | null { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 9e15) return null; return Math.round(number * 100).toString(); }
  private headers(): HttpHeaders { const token = this.auth.getAccessToken(); return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders(); }
}
