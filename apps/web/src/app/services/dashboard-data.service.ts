import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DashboardData {
  report: 'dashboard';
  companyId: string;
  fromDate: string;
  toDate: string;
  kpis: {
    revenuePaise: string;
    expensePaise: string;
    netProfitPaise: string;
    netMarginPercent: string;
    assetsPaise: string;
    liabilitiesPaise: string;
    equityPaise: string;
    bankBalancePaise: string;
    inventoryPaise: string;
    transactionCount: string;
    invoiceCount: string;
  };
  charts: {
    pnlTrend: Array<{ label: string; revenue_paise: string; expense_paise: string; profit_paise: string }>;
    revenueMix: Array<{ code: string; label: string; amount_paise: string }>;
    expenseMix: Array<{ code: string; label: string; amount_paise: string }>;
    receivablesAgeing: Record<string, string>;
    payablesAgeing: Record<string, string>;
    cashMovement: Array<{ label: string; inflow_paise: string; outflow_paise: string; net_paise: string }>;
  };
  receivables: { totalOutstandingPaise: string; invoiceCount: string };
  payables: { totalOutstandingPaise: string; billCount: string };
  recentActivity: Array<{ id: string; reference: string; date: string; description: string; source: string }>;
}

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://localhost:3000';

  getDashboard(fromDate?: string, toDate?: string): Observable<DashboardData> {
    const companyId = localStorage.getItem('ledgerloop_company_id');
    const accessToken = localStorage.getItem('ledgerloop_access_token');
    if (!companyId || !accessToken) {
      throw new Error('Configure ledgerloop_company_id and ledgerloop_access_token to load live dashboard data.');
    }

    let params = new HttpParams();
    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);

    return this.http.get<DashboardData>(`${this.apiBaseUrl}/companies/${companyId}/dashboard`, {
      params,
      headers: new HttpHeaders({ Authorization: `Bearer ${accessToken}` }),
    });
  }
}
