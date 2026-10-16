import { Routes } from '@angular/router';

import { authGuard } from './auth.guard';
import { AccountsPageComponent } from './pages/accounts-page.component';
import { AuthPageComponent } from './pages/auth-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { PartiesPageComponent } from './pages/parties-page.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'auth',
    component: AuthPageComponent,
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    component: DashboardPageComponent,
  },
  {
    path: 'accounting/accounts',
    canActivate: [authGuard],
    component: AccountsPageComponent,
  },
  {
    path: 'accounting/parties',
    canActivate: [authGuard],
    component: PartiesPageComponent,
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
