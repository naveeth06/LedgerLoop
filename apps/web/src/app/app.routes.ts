import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { AccountsPageComponent } from './pages/accounts-page.component';
import { AuthPageComponent } from './pages/auth-page.component';
import { BankingPageComponent } from './pages/banking-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { InventoryPageComponent } from './pages/inventory-page.component';
import { ItemsWarehousesPageComponent } from './pages/items-warehouses-page.component';
import { PartiesPageComponent } from './pages/parties-page.component';
import { PurchasesBillsPageComponent } from './pages/purchases-bills-page.component';
import { RemindersPageComponent } from './pages/reminders-page.component';
import { ReportsPageComponent } from './pages/reports-page.component';
import { SalesInvoiceDetailPageComponent } from './pages/sales-invoice-detail-page.component';
import { SalesPageComponent } from './pages/sales-page.component';
import { SalesReceiptsPageComponent } from './pages/sales-receipts-page.component';
import { SupplierPaymentsPageComponent } from './pages/supplier-payments-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'auth', component: AuthPageComponent },
  { path: 'dashboard', canActivate: [authGuard], component: DashboardPageComponent },
  { path: 'accounting/accounts', canActivate: [authGuard], component: AccountsPageComponent },
  { path: 'accounting/parties', canActivate: [authGuard], component: PartiesPageComponent },
  { path: 'accounting/items-warehouses', canActivate: [authGuard], component: ItemsWarehousesPageComponent },
  { path: 'sales/invoices/:invoiceId', canActivate: [authGuard], component: SalesInvoiceDetailPageComponent },
  { path: 'sales/invoices', canActivate: [authGuard], component: SalesPageComponent },
  { path: 'sales/receipts', canActivate: [authGuard], component: SalesReceiptsPageComponent },
  { path: 'purchases/bills', canActivate: [authGuard], component: PurchasesBillsPageComponent },
  { path: 'purchases/payments', canActivate: [authGuard], component: SupplierPaymentsPageComponent },
  { path: 'banking', canActivate: [authGuard], component: BankingPageComponent },
  { path: 'inventory', canActivate: [authGuard], component: InventoryPageComponent },
  { path: 'reports', canActivate: [authGuard], component: ReportsPageComponent },
  { path: 'reminders', canActivate: [authGuard], component: RemindersPageComponent },
  { path: '**', redirectTo: 'dashboard' },
];
