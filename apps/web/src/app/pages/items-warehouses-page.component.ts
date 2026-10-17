import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import { LucideBoxes, LucideEdit3, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideWarehouse } from '@lucide/angular';
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
  imports: [LucideBoxes, LucideEdit3, LucidePlus, LucideRefreshCw, LucideSearch, LucideToggleLeft, LucideWarehouse],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
              @if (viewMode() === 'items') { <svg lucideBoxes [size]="19"></svg> } @else { <svg lucideWarehouse [size]="19"></svg> }
            </span>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Masters</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Items & Warehouses</h1>
            </div>
          </div>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-[var(--ll-text-muted)]">Maintain the goods, services, and stock locations used by sales, purchases, and inventory workflows.</p>
        </div>
        <button type="button" class="ll-button-primary shrink-0" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>{{ viewMode() === 'items' ? 'New item' : 'New warehouse' }}</button>
      </header>

      @if (errorMessage()) {
        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
          <span>{{ errorMessage() }}</span>
          <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-white/5" (click)="loadCurrentView()">Retry</button>
        </div>
      }

      <section class="mt-6 overflow-hidden rounded-2xl border border-white/8 bg-[var(--ll-surface)]/80 shadow-xl shadow-black/10">
        <div class="flex flex-col gap-4 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div class="flex w-fit rounded-xl border border-white/8 bg-white/[0.025] p-1" role="tablist" aria-label="Master data">
            <button type="button" class="ll-tab" [class.ll-tab-active]="viewMode() === 'items'" (click)="switchView('items')"><svg lucideBoxes [size]="15"></svg>Items</button>
            <button type="button" class="ll-tab" [class.ll-tab-active]="viewMode() === 'warehouses'" (click)="switchView('warehouses')"><svg lucideWarehouse [size]="15"></svg>Warehouses</button>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label class="relative block sm:w-72">
              <span class="sr-only">Search {{ viewMode() === 'items' ? 'items' : 'warehouses' }}</span>
              <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" lucideSearch [size]="16"></svg>
              <input class="ll-input w-full pl-9" type="search" [placeholder]="viewMode() === 'items' ? 'Search items or item codes' : 'Search warehouses or codes'" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" />
            </label>
            @if (viewMode() === 'items') {
              <select class="ll-input text-xs" aria-label="Filter by item type" [value]="itemTypeFilter()" (change)="itemTypeFilter.set($any($event.target).value); loadCurrentView()">
                <option value="all">All types</option><option value="goods">Goods</option><option value="service">Services</option>
              </select>
            }
            <button type="button" class="ll-icon-button" [disabled]="loading()" aria-label="Refresh records" title="Refresh" (click)="loadCurrentView()"><svg lucideRefreshCw [size]="16" [class.animate-spin]="loading()"></svg></button>
          </div>
        </div>

        @if (loading() && currentRows().length === 0) {
          <div class="space-y-3 p-5">@for (row of [1,2,3,4,5,6]; track row) { <div class="h-14 animate-pulse rounded-xl bg-white/[0.035]"></div> }</div>
        } @else if (filteredRows().length === 0) {
          <div class="px-6 py-16 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-500">@if (viewMode() === 'items') { <svg lucideBoxes [size]="20"></svg> } @else { <svg lucideWarehouse [size]="20"></svg> }</div>
            <h2 class="mt-4 text-sm font-semibold text-white">{{ currentRows().length ? 'No matching records' : (viewMode() === 'items' ? 'No items yet' : 'No warehouses yet') }}</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">Create the master data needed for sales, purchases, and inventory workflows.</p>
            @if (!currentRows().length) { <button type="button" class="ll-button-primary mt-5" (click)="openCreateForm()"><svg lucidePlus [size]="16"></svg>{{ viewMode() === 'items' ? 'Create first item' : 'Create first warehouse' }}</button> }
          </div>
        } @else if (viewMode() === 'items') {
          <div class="overflow-x-auto"><table class="min-w-[980px] w-full text-left text-sm"><thead><tr class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><th class="px-5 py-3.5 font-medium">Item</th><th class="px-5 py-3.5 font-medium">Type</th><th class="px-5 py-3.5 font-medium">HSN / SAC</th><th class="px-5 py-3.5 font-medium">GST</th><th class="px-5 py-3.5 font-medium">Selling price</th><th class="px-5 py-3.5 font-medium">Inventory</th><th class="px-5 py-3.5 font-medium">Status</th><th class="px-5 py-3.5 text-right font-medium">Actions</th></tr></thead><tbody class="divide-y divide-white/6">@for (item of filteredItems(); track item.id) { <tr class="transition-colors hover:bg-white/[0.025]"><td class="min-w-56 px-5 py-4"><p class="font-medium text-white">{{ item.name }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ item.item_code }}</p></td><td class="whitespace-nowrap px-5 py-4"><span class="ll-type">{{ item.item_type === 'goods' ? 'Goods' : 'Service' }}</span></td><td class="px-5 py-4 font-mono text-xs text-zinc-400">{{ item.hsn_sac || '—' }}</td><td class="px-5 py-4 text-xs text-zinc-300">{{ item.gst_rate_bps / 100 }}%</td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-300">{{ formatPaise(item.selling_price_paise) }}</td><td class="whitespace-nowrap px-5 py-4 text-xs text-zinc-400">{{ item.track_inventory ? 'Tracked' : 'Not tracked' }}</td><td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!item.is_active">{{ item.is_active ? 'Active' : 'Inactive' }}</span></td><td class="whitespace-nowrap px-5 py-4"><div class="flex justify-end gap-1"><button type="button" class="ll-icon-button" [attr.aria-label]="'Edit ' + item.name" title="Edit item" (click)="openEditItem(item)"><svg lucideEdit3 [size]="15"></svg></button><button type="button" class="ll-icon-button" [attr.aria-label]="item.is_active ? 'Deactivate ' + item.name : 'Activate ' + item.name" [disabled]="saving()" title="Change status" (click)="toggleItemStatus(item)"><svg lucideToggleLeft [size]="16"></svg></button></div></td></tr> }</tbody></table></div>
        } @else {
          <div class="overflow-x-auto"><table class="min-w-[760px] w-full text-left text-sm"><thead><tr class="border-b border-white/8 bg-white/[0.015] text-xs uppercase tracking-[0.08em] text-zinc-500"><th class="px-5 py-3.5 font-medium">Warehouse</th><th class="px-5 py-3.5 font-medium">Branch</th><th class="px-5 py-3.5 font-medium">Address</th><th class="px-5 py-3.5 font-medium">Status</th><th class="px-5 py-3.5 text-right font-medium">Actions</th></tr></thead><tbody class="divide-y divide-white/6">@for (warehouse of filteredWarehouses(); track warehouse.id) { <tr class="transition-colors hover:bg-white/[0.025]"><td class="min-w-64 px-5 py-4"><p class="font-medium text-white">{{ warehouse.name }}</p><p class="mt-1 font-mono text-[11px] text-zinc-500">{{ warehouse.warehouse_code }}</p></td><td class="px-5 py-4 font-mono text-xs text-zinc-500">{{ warehouse.branch_id || '—' }}</td><td class="max-w-md px-5 py-4 text-xs text-zinc-400">{{ addressSummary(warehouse.address) }}</td><td class="whitespace-nowrap px-5 py-4"><span class="ll-status" [class.ll-status-inactive]="!warehouse.is_active">{{ warehouse.is_active ? 'Active' : 'Inactive' }}</span></td><td class="whitespace-nowrap px-5 py-4"><div class="flex justify-end gap-1"><button type="button" class="ll-icon-button" [attr.aria-label]="'Edit ' + warehouse.name" title="Edit warehouse" (click)="openEditWarehouse(warehouse)"><svg lucideEdit3 [size]="15"></svg></button><button type="button" class="ll-icon-button" [attr.aria-label]="warehouse.is_active ? 'Deactivate ' + warehouse.name : 'Activate ' + warehouse.name" [disabled]="saving()" title="Change status" (click)="toggleWarehouseStatus(warehouse)"><svg lucideToggleLeft [size]="16"></svg></button></div></td></tr> }</tbody></table></div>
        }
        @if (currentRows().length) { <div class="border-t border-white/8 px-5 py-3 text-xs text-[var(--ll-text-muted)]">Showing {{ filteredRows().length }} of {{ currentRows().length }} records</div> }
      </section>
    </section>

    @if (formOpen()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" (click)="closeForm()">
        <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/10 bg-[var(--ll-surface-elevated)] p-5 shadow-2xl shadow-black/50 sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="master-form-title" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-4"><div><p class="ll-eyebrow">{{ editingItem() ? 'Edit item' : (editingWarehouse() ? 'Edit warehouse' : (viewMode() === 'items' ? 'Item master' : 'Warehouse master')) }}</p><h2 id="master-form-title" class="mt-1 text-lg font-semibold text-white">{{ editingItem() ? 'Update item' : (editingWarehouse() ? 'Update warehouse' : ('Create ' + (viewMode() === 'items' ? 'item' : 'warehouse'))) }}</h2></div><button type="button" class="ll-icon-button" aria-label="Close form" title="Close" (click)="closeForm()">×</button></div>

          @if (viewMode() === 'items') {
            <form class="mt-6 space-y-5" (submit)="saveItem($event)">
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Item code</span><input class="ll-input mt-1.5 w-full opacity-60" disabled maxlength="32" [value]="itemCode()" placeholder="Generated automatically" /><span class="ll-help">Automatically generated and locked for this item.</span></label><label><span class="ll-label">Type</span><select class="ll-input mt-1.5 w-full" [disabled]="!!editingItem()" [value]="itemType()" (change)="onItemTypeChange($any($event.target).value)"><option value="goods">Goods</option><option value="service">Service</option></select></label></div>
              <label><span class="ll-label">Name</span><input class="ll-input mt-1.5 w-full" required maxlength="200" [value]="itemName()" (input)="itemName.set($any($event.target).value)" placeholder="e.g. Office chair" /></label>
              <div class="grid gap-4 sm:grid-cols-3"><label><span class="ll-label">HSN / SAC</span><input class="ll-input mt-1.5 w-full" maxlength="8" pattern="[0-9]{4,8}" inputmode="numeric" [value]="hsnSac()" (input)="hsnSac.set($any($event.target).value)" placeholder="e.g. 940330" /></label><label><span class="ll-label">Unit</span><input class="ll-input mt-1.5 w-full" maxlength="16" [value]="unitCode()" (input)="unitCode.set($any($event.target).value)" placeholder="e.g. pcs" /></label><label><span class="ll-label">GST rate</span><input class="ll-input mt-1.5 w-full" type="number" min="0" max="100" step="0.01" [value]="gstRate()" (input)="gstRate.set($any($event.target).value)" placeholder="e.g. 18" /></label></div>
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Selling price (₹)</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="sellingPrice()" (input)="sellingPrice.set($any($event.target).value)" placeholder="0.00" /></label><label><span class="ll-label">Purchase price (₹)</span><input class="ll-input mt-1.5 w-full" inputmode="decimal" [value]="purchasePrice()" (input)="purchasePrice.set($any($event.target).value)" placeholder="0.00" /></label></div>
              @if (itemType() === 'goods') { <label class="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" [checked]="trackInventory()" (change)="trackInventory.set($any($event.target).checked)" />Track inventory for this item</label> }
              @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">{{ formError() }}</p> }
              <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-button-secondary" (click)="closeForm()">Cancel</button><button type="submit" class="ll-button-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : (editingItem() ? 'Save changes' : 'Create item') }}</button></div>
            </form>
          } @else {
            <form class="mt-6 space-y-5" (submit)="saveWarehouse($event)">
              <div class="grid gap-4 sm:grid-cols-2"><label><span class="ll-label">Warehouse code</span><input class="ll-input mt-1.5 w-full opacity-60" disabled maxlength="32" [value]="warehouseCode()" placeholder="Generated automatically" /><span class="ll-help">Automatically generated and locked for this warehouse.</span></label><label><span class="ll-label">Warehouse name</span><input class="ll-input mt-1.5 w-full" required maxlength="160" [value]="warehouseName()" (input)="warehouseName.set($any($event.target).value)" placeholder="e.g. Main warehouse" /></label></div>
              <label><span class="ll-label">Branch ID <span class="font-normal text-zinc-500">(optional)</span></span><input class="ll-input mt-1.5 w-full" [value]="warehouseBranchId()" (input)="warehouseBranchId.set($any($event.target).value)" placeholder="Paste branch UUID" /></label>
              <label><span class="ll-label">Address <span class="font-normal text-zinc-500">(optional JSON)</span></span><textarea class="ll-input mt-1.5 min-h-28 w-full resize-y font-mono text-xs" [value]="warehouseAddress()" (input)="warehouseAddress.set($any($event.target).value)" placeholder='{"line1":"12 Market Road","city":"Chennai","state":"Tamil Nadu","pincode":"600001"}'></textarea><span class="ll-help">Enter a JSON object. Leave blank if the warehouse has no address yet.</span></label>
              @if (formError()) { <p class="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">{{ formError() }}</p> }
              <div class="flex justify-end gap-2 border-t border-white/8 pt-4"><button type="button" class="ll-button-secondary" (click)="closeForm()">Cancel</button><button type="submit" class="ll-button-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : (editingWarehouse() ? 'Save changes' : 'Create warehouse') }}</button></div>
            </form>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .ll-tab { display:inline-flex; align-items:center; justify-content:center; gap:.45rem; min-height:2.25rem; padding:.5rem .75rem; border:1px solid transparent; border-radius:.65rem; color:var(--ll-text-muted); background:transparent; font-size:.75rem; font-weight:600; transition:color 180ms ease,background-color 180ms ease,border-color 180ms ease; }
    .ll-tab:hover { color:var(--ll-text); background:color-mix(in srgb,var(--ll-text) 4%,transparent); }
    .ll-tab-active { color:var(--ll-text); border-color:color-mix(in srgb,var(--ll-primary-soft) 20%,transparent); background:color-mix(in srgb,var(--ll-primary) 10%,transparent); }
    .ll-input { min-height:2.5rem; border:1px solid var(--ll-border); border-radius:.75rem; background:color-mix(in srgb,var(--ll-text) 2.5%,transparent); color:var(--ll-text); padding:.625rem .75rem; outline:none; font-size:.75rem; transition:border-color 180ms ease,background-color 180ms ease,box-shadow 180ms ease; }
    .ll-input::placeholder { color:#6f6f7b; opacity:1; }
    .ll-input:focus { border-color:color-mix(in srgb,var(--ll-primary-soft) 45%,transparent); background:color-mix(in srgb,var(--ll-text) 4%,transparent); box-shadow:0 0 0 3px color-mix(in srgb,var(--ll-primary) 9%,transparent); }
    select.ll-input option { background:var(--ll-surface-elevated); color:var(--ll-text); }
    .ll-label { display:block; color:var(--ll-text-muted); font-size:.7rem; font-weight:650; }
    .ll-help { display:block; margin-top:.35rem; color:var(--ll-text-muted); font-size:.65rem; line-height:1rem; }
    .ll-type,.ll-status { display:inline-flex; align-items:center; border-radius:999px; padding:.3rem .55rem; font-size:.66rem; font-weight:650; }
    .ll-type { color:var(--ll-text-muted); background:color-mix(in srgb,var(--ll-text) 5%,transparent); }
    .ll-status { color:#86efac; background:rgba(34,197,94,.1); }
    .ll-status-inactive { color:#fda4af; background:rgba(244,63,94,.1); }
    @media (max-width: 640px) { .ll-tab { padding:.5rem .65rem; } }
  `],
})
export class ItemsWarehousesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly viewMode = signal<ViewMode>('items');
  readonly items = signal<Item[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly searchTerm = signal('');
  readonly itemTypeFilter = signal<'all' | ItemType>('all');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly formError = signal('');
  readonly formOpen = signal(false);
  readonly editingItem = signal<Item | null>(null);
  readonly editingWarehouse = signal<Warehouse | null>(null);

  readonly itemCode = signal('');
  readonly itemName = signal('');
  readonly itemType = signal<ItemType>('goods');
  readonly hsnSac = signal('');
  readonly unitCode = signal('unit');
  readonly gstRate = signal('0');
  readonly sellingPrice = signal('0.00');
  readonly purchasePrice = signal('0.00');
  readonly trackInventory = signal(true);
  readonly warehouseCode = signal('');
  readonly warehouseName = signal('');
  readonly warehouseBranchId = signal('');
  readonly warehouseAddress = signal('');

  constructor() { this.loadCurrentView(); }

  currentRows(): Array<Item | Warehouse> { return this.viewMode() === 'items' ? this.items() : this.warehouses(); }
  filteredRows(): Array<Item | Warehouse> {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.currentRows();
    return this.currentRows().filter((row) => this.viewMode() === 'items'
      ? `${(row as Item).name} ${(row as Item).item_code}`.toLowerCase().includes(term)
      : `${(row as Warehouse).name} ${(row as Warehouse).warehouse_code}`.toLowerCase().includes(term));
  }
  filteredItems(): Item[] { return this.filteredRows() as Item[]; }
  filteredWarehouses(): Warehouse[] { return this.filteredRows() as Warehouse[]; }
  addressSummary(address: Record<string, unknown>): string { return Object.values(address).filter((value) => value !== null && value !== undefined && String(value).trim()).map(String).join(', ') || '—'; }
  formatPaise(value: string): string { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value || 0) / 100); }

  switchView(mode: ViewMode): void { this.viewMode.set(mode); this.searchTerm.set(''); this.loadCurrentView(); }

  loadCurrentView(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) return;
    this.loading.set(true); this.errorMessage.set('');
    const url = this.viewMode() === 'items'
      ? `${API_BASE_URL}/companies/${companyId}/items${this.itemTypeFilter() === 'all' ? '' : `?type=${this.itemTypeFilter()}`}`
      : `${API_BASE_URL}/companies/${companyId}/warehouses`;
    this.http.get<{ items?: Item[]; warehouses?: Warehouse[] }>(url).pipe(
      catchError((error) => { this.errorMessage.set(error?.error?.message || `Unable to load ${this.viewMode()}.`); return of({ items: undefined, warehouses: undefined }); }),
      finalize(() => this.loading.set(false)),
    ).subscribe((response) => { if (this.viewMode() === 'items') this.items.set(response.items ?? []); else this.warehouses.set(response.warehouses ?? []); });
  }

  openCreateForm(): void { this.resetForm(); this.formOpen.set(true); }
  openEditItem(item: Item): void {
    this.editingWarehouse.set(null); this.editingItem.set(item); this.formError.set(''); this.itemCode.set(item.item_code); this.itemName.set(item.name); this.itemType.set(item.item_type);
    this.hsnSac.set(item.hsn_sac ?? ''); this.unitCode.set(item.unit_code); this.gstRate.set(String(item.gst_rate_bps / 100));
    this.sellingPrice.set((Number(item.selling_price_paise) / 100).toFixed(2)); this.purchasePrice.set((Number(item.purchase_price_paise) / 100).toFixed(2)); this.trackInventory.set(item.track_inventory); this.formOpen.set(true);
  }
  openEditWarehouse(warehouse: Warehouse): void {
    this.editingItem.set(null); this.editingWarehouse.set(warehouse); this.formError.set(''); this.warehouseCode.set(warehouse.warehouse_code); this.warehouseName.set(warehouse.name);
    this.warehouseBranchId.set(warehouse.branch_id ?? ''); this.warehouseAddress.set(JSON.stringify(warehouse.address ?? {}, null, 2)); this.formOpen.set(true);
  }
  closeForm(): void { if (this.saving()) return; this.formOpen.set(false); this.formError.set(''); this.editingItem.set(null); this.editingWarehouse.set(null); }
  resetForm(): void { this.editingItem.set(null); this.editingWarehouse.set(null); this.formError.set(''); this.itemCode.set(this.nextItemCode()); this.itemName.set(''); this.itemType.set('goods'); this.hsnSac.set(''); this.unitCode.set('unit'); this.gstRate.set('0'); this.sellingPrice.set('0.00'); this.purchasePrice.set('0.00'); this.trackInventory.set(true); this.warehouseCode.set(this.nextWarehouseCode()); this.warehouseName.set(''); this.warehouseBranchId.set(''); this.warehouseAddress.set(''); }

  private nextItemCode(): string {
    const existing = new Set(this.items().map((item) => item.item_code.toUpperCase()));
    for (let index = 1; index <= 999; index += 1) { const candidate = `ITEM-${String(index).padStart(3, '0')}`; if (!existing.has(candidate)) return candidate; }
    return `ITEM-${Date.now().toString().slice(-8)}`;
  }

  private nextWarehouseCode(): string {
    const existing = new Set(this.warehouses().map((warehouse) => warehouse.warehouse_code.toUpperCase()));
    for (let index = 1; index <= 999; index += 1) { const candidate = `WH-${String(index).padStart(3, '0')}`; if (!existing.has(candidate)) return candidate; }
    return `WH-${Date.now().toString().slice(-8)}`;
  }

  onItemTypeChange(value: string): void { this.itemType.set(value === 'service' ? 'service' : 'goods'); }

  private toPaise(value: string): string {
    const normalized = value.trim();
    if (!/^(?:0|[0-9]+)(?:\.[0-9]{1,2})?$/.test(normalized)) throw new Error('Enter a valid rupee amount with at most two decimal places.');
    const [whole, fraction = ''] = normalized.split('.');
    return String(BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)));
  }

  saveItem(event: Event): void {
    event.preventDefault(); this.formError.set('');
    try {
      const itemCode = this.itemCode().trim();
      const payload = { name: this.itemName().trim(), itemType: this.itemType(), hsnSac: this.hsnSac().trim() || undefined, unitCode: this.unitCode().trim(), gstRateBps: Math.round(Number(this.gstRate()) * 100), sellingPricePaise: this.toPaise(this.sellingPrice()), purchasePricePaise: this.toPaise(this.purchasePrice()), trackInventory: this.itemType() === 'goods' && this.trackInventory() };
      if (!itemCode) throw new Error('An item code could not be generated. Please refresh and try again.');
      if (!payload.name || !payload.unitCode || !Number.isFinite(payload.gstRateBps) || payload.gstRateBps < 0 || payload.gstRateBps > 10000) throw new Error('Check the item details and GST rate.');
      const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
      this.saving.set(true); const item = this.editingItem();
      const request$ = item ? this.http.patch(`${API_BASE_URL}/companies/${companyId}/items/${item.id}`, payload) : this.http.post(`${API_BASE_URL}/companies/${companyId}/items`, { itemCode, ...payload });
      request$.pipe(catchError((error) => { this.formError.set(error?.error?.message || 'Unable to save item. Check the details.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe((response) => { if (response) { this.closeForm(); this.loadCurrentView(); } });
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Unable to save item.'); }
  }

  toggleItemStatus(item: Item): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
    this.saving.set(true); this.errorMessage.set('');
    this.http.patch(`${API_BASE_URL}/companies/${companyId}/items/${item.id}/status`, { isActive: !item.is_active }).pipe(catchError((error) => { this.errorMessage.set(error?.error?.message || 'Unable to update item status.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe((response) => { if (response) this.loadCurrentView(); });
  }

  saveWarehouse(event: Event): void {
    event.preventDefault(); this.formError.set('');
    let address: Record<string, unknown> = {};
    try { if (this.warehouseAddress().trim()) address = JSON.parse(this.warehouseAddress()); if (typeof address !== 'object' || address === null || Array.isArray(address)) throw new Error('Address must be a JSON object.'); }
    catch (error) { this.formError.set(error instanceof Error ? error.message : 'Address must be valid JSON.'); return; }
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
    const name = this.warehouseName().trim(); if (!name) { this.formError.set('Warehouse name is required.'); return; }
    const warehouseCode = this.warehouseCode().trim(); if (!warehouseCode) { this.formError.set('A warehouse code could not be generated. Please refresh and try again.'); return; }
    const branchId = this.warehouseBranchId().trim();
    if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) { this.formError.set('Branch ID must be a valid UUID.'); return; }
    this.saving.set(true);
    const warehouse = this.editingWarehouse(); const payload = { name, branchId: branchId || undefined, address };
    const request$ = warehouse ? this.http.patch(`${API_BASE_URL}/companies/${companyId}/warehouses/${warehouse.id}`, payload) : this.http.post(`${API_BASE_URL}/companies/${companyId}/warehouses`, { warehouseCode, ...payload });
    request$.pipe(catchError((error) => { this.formError.set(error?.error?.message || 'Unable to save warehouse. Check the details.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe((response) => { if (response) { this.closeForm(); this.loadCurrentView(); } });
  }

  toggleWarehouseStatus(warehouse: Warehouse): void {
    const companyId = this.auth.selectedCompany()?.id; if (!companyId) return;
    this.saving.set(true); this.errorMessage.set('');
    this.http.patch(`${API_BASE_URL}/companies/${companyId}/warehouses/${warehouse.id}/status`, { isActive: !warehouse.is_active }).pipe(catchError((error) => { this.errorMessage.set(error?.error?.message || 'Unable to update warehouse status.'); return of(null); }), finalize(() => this.saving.set(false))).subscribe((response) => { if (response) this.loadCurrentView(); });
  }
}
