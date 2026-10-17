import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, finalize, of } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { API_BASE_URL } from '../core/api.config';
import { LucideBoxes, LucidePencil, LucidePlus, LucideRefreshCw, LucideSearch, LucideWarehouse } from 'lucide-angular';

type ViewMode = 'items' | 'warehouses';
type ItemType = 'all' | 'goods' | 'service';

interface Item {
  id: string;
  item_code: string;
  name: string;
  item_type: 'goods' | 'service';
  hsn_sac?: string | null;
  unit_code: string;
  gst_rate_bps: number;
  selling_price_paise: string;
  purchase_price_paise: string;
  track_inventory: boolean;
  active: boolean;
}

interface Warehouse {
  id: string;
  warehouse_code: string;
  name: string;
  branch_id?: string | null;
  address?: string | null;
  active: boolean;
}

@Component({
  selector: 'app-items-warehouses-page',
  standalone: true,
  imports: [LucideBoxes, LucidePencil, LucidePlus, LucideRefreshCw, LucideSearch, LucideWarehouse],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-slate-400">Accounting</p>
          <h1 class="text-2xl font-semibold text-white">Items &amp; Warehouses</h1>
          <p class="mt-1 text-sm text-slate-400">Manage products, services and warehouse master data.</p>
        </div>
        <button type="button" class="btn-primary" (click)="openCreateForm()">
          <svg lucidePlus class="h-4 w-4"></svg>
          {{ viewMode() === 'items' ? 'Add item' : 'Add warehouse' }}
        </button>
      </header>

      <div class="flex flex-wrap gap-2 border-b border-slate-800">
        <button type="button" class="tab-button" [class.tab-active]="viewMode() === 'items'" (click)="switchView('items')">
          <svg lucideBoxes class="h-4 w-4"></svg> Items
        </button>
        <button type="button" class="tab-button" [class.tab-active]="viewMode() === 'warehouses'" (click)="switchView('warehouses')">
          <svg lucideWarehouse class="h-4 w-4"></svg> Warehouses
        </button>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label class="relative flex-1">
          <svg lucideSearch class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"></svg>
          <input class="input pl-9" [value]="searchTerm()" (input)="searchTerm.set($any($event.target).value)" placeholder="Search..." />
        </label>
        @if (viewMode() === 'items') {
          <select class="input sm:w-44" [value]="itemTypeFilter()" (change)="itemTypeFilter.set($any($event.target).value); loadCurrentView()">
            <option value="all">All types</option>
            <option value="goods">Goods</option>
            <option value="service">Services</option>
          </select>
        }
        <button type="button" class="btn-secondary" (click)="loadCurrentView()" [disabled]="loading()">
          <svg lucideRefreshCw class="h-4 w-4"></svg> Refresh
        </button>
      </div>

      @if (errorMessage()) {
        <div class="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">{{ errorMessage() }}</div>
      }

      @if (loading()) {
        <div class="card p-8 text-center text-sm text-slate-400">Loading...</div>
      } @else if (viewMode() === 'items') {
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Code</th><th class="px-4 py-3">Name</th><th class="px-4 py-3">Type</th><th class="px-4 py-3">GST</th><th class="px-4 py-3">Selling price</th><th class="px-4 py-3">Status</th><th class="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                @for (item of filteredItems(); track item.id) {
                  <tr class="text-slate-300">
                    <td class="px-4 py-3 font-medium text-white">{{ item.item_code }}</td><td class="px-4 py-3">{{ item.name }}</td><td class="px-4 py-3 capitalize">{{ item.item_type }}</td><td class="px-4 py-3">{{ item.gst_rate_bps / 100 }}%</td><td class="px-4 py-3">{{ formatPaise(item.selling_price_paise) }}</td><td class="px-4 py-3">{{ item.active ? 'Active' : 'Inactive' }}</td>
                    <td class="px-4 py-3 text-right"><button type="button" class="btn-secondary" (click)="openEditItem(item)"><svg lucidePencil class="h-4 w-4"></svg> Edit</button></td>
                  </tr>
                } @empty { <tr><td colspan="7" class="px-4 py-10 text-center text-slate-500">No items found.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-3">Code</th><th class="px-4 py-3">Name</th><th class="px-4 py-3">Branch</th><th class="px-4 py-3">Status</th></tr></thead>
              <tbody class="divide-y divide-slate-800">
                @for (warehouse of filteredWarehouses(); track warehouse.id) { <tr class="text-slate-300"><td class="px-4 py-3 font-medium text-white">{{ warehouse.warehouse_code }}</td><td class="px-4 py-3">{{ warehouse.name }}</td><td class="px-4 py-3">{{ warehouse.branch_id || '—' }}</td><td class="px-4 py-3">{{ warehouse.active ? 'Active' : 'Inactive' }}</td></tr> } @empty { <tr><td colspan="4" class="px-4 py-10 text-center text-slate-500">No warehouses found.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (formOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" (click)="closeForm()">
          <div class="card w-full max-w-2xl p-6" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            <div class="mb-5 flex items-center justify-between"><h2 class="text-lg font-semibold text-white">{{ editingItem() ? 'Edit item' : 'Add item' }}</h2><button type="button" class="text-slate-400" (click)="closeForm()">✕</button></div>
            @if (formError()) { <div class="mb-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">{{ formError() }}</div> }
            <div class="grid gap-4 sm:grid-cols-2">
              <label><span class="label">Item code</span><input class="input" [value]="itemCode()" [disabled]="!!editingItem()" (input)="itemCode.set($any($event.target).value)" /></label>
              <label><span class="label">Name</span><input class="input" [value]="itemName()" (input)="itemName.set($any($event.target).value)" /></label>
              <label><span class="label">Type</span><select class="input" [value]="itemType()" (change)="itemType.set($any($event.target).value)"><option value="goods">Goods</option><option value="service">Service</option></select></label>
              <label><span class="label">HSN / SAC</span><input class="input" [value]="hsnSac()" (input)="hsnSac.set($any($event.target).value)" /></label>
              <label><span class="label">Unit</span><input class="input" [value]="unitCode()" (input)="unitCode.set($any($event.target).value)" /></label>
              <label><span class="label">GST %</span><input class="input" type="number" min="0" max="100" step="0.01" [value]="gstRate()" (input)="gstRate.set($any($event.target).value)" /></label>
              <label><span class="label">Selling price (₹)</span><input class="input" type="number" min="0" step="0.01" [value]="sellingPrice()" (input)="sellingPrice.set($any($event.target).value)" /></label>
              <label><span class="label">Purchase price (₹)</span><input class="input" type="number" min="0" step="0.01" [value]="purchasePrice()" (input)="purchasePrice.set($any($event.target).value)" /></label>
            </div>
            @if (itemType() === 'goods') { <label class="mt-4 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" [checked]="trackInventory()" (change)="trackInventory.set($any($event.target).checked)" /> Track inventory</label> }
            <div class="mt-6 flex justify-end gap-3"><button type="button" class="btn-secondary" (click)="closeForm()">Cancel</button><button type="button" class="btn-primary" (click)="saveItem()" [disabled]="saving()">{{ saving() ? 'Saving...' : (editingItem() ? 'Save changes' : 'Create item') }}</button></div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .card { border: 1px solid rgb(30 41 59); border-radius: .75rem; background: rgb(15 23 42 / .72); }
    .input { width: 100%; border: 1px solid rgb(51 65 85); border-radius: .5rem; background: rgb(15 23 42); color: white; padding: .625rem .75rem; outline: none; }
    .input:focus { border-color: rgb(100 116 139); }
    .input:disabled { opacity: .55; }
    .btn-primary, .btn-secondary, .tab-button { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border-radius: .5rem; padding: .625rem .875rem; font-size: .875rem; font-weight: 600; }
    .btn-primary { background: rgb(226 232 240); color: rgb(15 23 42); }
    .btn-secondary, .tab-button { border: 1px solid rgb(51 65 85); color: rgb(203 213 225); background: transparent; }
    .tab-button { border-width: 0 0 2px; border-radius: 0; }
    .tab-active { border-color: rgb(226 232 240); color: white; }
    .label { display: block; margin-bottom: .375rem; font-size: .75rem; color: rgb(148 163 184); }
  `],
})
export class ItemsWarehousesPageComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly viewMode = signal<ViewMode>('items');
  readonly itemTypeFilter = signal<ItemType>('all');
  readonly searchTerm = signal('');
  readonly items = signal<Item[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly formError = signal('');
  readonly formOpen = signal(false);
  readonly editingItem = signal<Item | null>(null);
  readonly itemCode = signal('');
  readonly itemName = signal('');
  readonly itemType = signal<'goods' | 'service'>('goods');
  readonly hsnSac = signal('');
  readonly unitCode = signal('PCS');
  readonly gstRate = signal('0');
  readonly sellingPrice = signal('0');
  readonly purchasePrice = signal('0');
  readonly trackInventory = signal(true);

  readonly filteredItems = computed(() => { const q = this.searchTerm().trim().toLowerCase(); return this.items().filter(item => !q || `${item.item_code} ${item.name} ${item.hsn_sac ?? ''}`.toLowerCase().includes(q)); });
  readonly filteredWarehouses = computed(() => { const q = this.searchTerm().trim().toLowerCase(); return this.warehouses().filter(item => !q || `${item.warehouse_code} ${item.name} ${item.address ?? ''}`.toLowerCase().includes(q)); });

  constructor() { this.loadCurrentView(); }

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
      catchError(() => { this.errorMessage.set(`Unable to load ${this.viewMode()}.`); return of({ items: undefined, warehouses: undefined }); }),
      finalize(() => { this.loading.set(false); this.cdr.markForCheck(); }),
    ).subscribe((response) => { if (this.viewMode() === 'items') this.items.set(response.items ?? []); else this.warehouses.set(response.warehouses ?? []); this.cdr.markForCheck(); });
  }

  openCreateForm(): void { this.resetForm(); this.formOpen.set(true); }
  openEditItem(item: Item): void {
    this.editingItem.set(item); this.formError.set(''); this.itemCode.set(item.item_code); this.itemName.set(item.name); this.itemType.set(item.item_type);
    this.hsnSac.set(item.hsn_sac ?? ''); this.unitCode.set(item.unit_code); this.gstRate.set(String(item.gst_rate_bps / 100)); this.sellingPrice.set(String(Number(item.selling_price_paise) / 100)); this.purchasePrice.set(String(Number(item.purchase_price_paise) / 100)); this.trackInventory.set(item.track_inventory); this.formOpen.set(true);
  }
  closeForm(): void { this.formOpen.set(false); this.editingItem.set(null); this.formError.set(''); }
  resetForm(): void { this.editingItem.set(null); this.formError.set(''); this.itemCode.set(''); this.itemName.set(''); this.itemType.set('goods'); this.hsnSac.set(''); this.unitCode.set('PCS'); this.gstRate.set('0'); this.sellingPrice.set('0'); this.purchasePrice.set('0'); this.trackInventory.set(true); }

  saveItem(): void {
    const companyId = this.auth.selectedCompany()?.id;
    if (!companyId) return;
    if (!this.itemCode().trim() || !this.itemName().trim() || !this.unitCode().trim()) { this.formError.set('Code, name and unit are required.'); return; }
    const payload = {
      name: this.itemName().trim(), itemType: this.itemType(), hsnSac: this.hsnSac().trim() || null, unitCode: this.unitCode().trim(),
      gstRateBps: Math.round(Number(this.gstRate() || 0) * 100), sellingPricePaise: Math.round(Number(this.sellingPrice() || 0) * 100), purchasePricePaise: Math.round(Number(this.purchasePrice() || 0) * 100), trackInventory: this.itemType() === 'goods' && this.trackInventory(),
    };
    const existing = this.editingItem();
    const request$ = existing
      ? this.http.patch(`${API_BASE_URL}/companies/${companyId}/items/${existing.id}`, payload)
      : this.http.post(`${API_BASE_URL}/companies/${companyId}/items`, { ...payload, itemCode: this.itemCode().trim() });
    this.saving.set(true); this.formError.set('');
    request$.pipe(catchError((error) => { this.formError.set(error?.error?.message ?? 'Unable to save item.'); return of(null); }), finalize(() => { this.saving.set(false); this.cdr.markForCheck(); })).subscribe((result) => { if (result === null) return; this.closeForm(); this.loadCurrentView(); });
  }
}
