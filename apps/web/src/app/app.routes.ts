import { Routes } from '@angular/router';

import { authGuard } from './auth.guard';
import { AccountsPageComponent } from './pages/accounts-page.component';
import { AuthPageComponent } from './pages/auth-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { ItemsWarehousesPageComponent } from './pages/items-warehouses-page.component';
import { PartiesPageComponent } from './pages/parties-page.component';
import { SalesPageComponent } from './pages/sales-page.component';
import { SalesReceiptsPageComponent } from './pages/sales-receipts-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'auth', component: AuthPageComponent },
  { path: 'dashboard', canActivate: [authGuard], component: DashboardPageComponent },
  { path: 'accounting/accounts', canActivate: [authGuard], component: AccountsPageComponent },
  { path: 'accounting/parties', canActivate: [authGuard], component: PartiesPageComponent },
  { path: 'accounting/items-warehouses', canActivate: [authGuard], component: ItemsWarehousesPageComponent },
  { path: 'sales/invoices', canActivate: [authGuard], component: SalesPageComponent },
  { path: 'sales/receipts', canActivate: [authGuard], component: SalesReceiptsPageComponent },
  { path: '**', redirectTo: 'dashboard' },
];
