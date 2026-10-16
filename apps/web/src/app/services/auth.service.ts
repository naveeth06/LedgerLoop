import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, firstValueFrom, of, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface Company {
  id: string;
  legal_name: string;
  display_name: string;
  base_currency: string;
  created_at: string;
}

interface AuthResponse {
  user?: AuthUser;
  accessToken: string;
  csrfToken: string;
}

interface CompaniesResponse {
  companies: Array<{
    company: Company;
    membership: { id: string; role: 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer' };
  }>;
}

interface CreateCompanyResponse {
  company: Company;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = 'http://localhost:3000';
  private readonly csrfStorageKey = 'ledgerloop_csrf_token';
  private readonly companyStorageKey = 'ledgerloop_company_id';

  private accessTokenValue = '';
  readonly user = signal<AuthUser | null>(null);
  readonly companies = signal<Company[]>([]);
  readonly selectedCompany = signal<Company | null>(null);

  async initialize(): Promise<void> {
    const csrfToken = sessionStorage.getItem(this.csrfStorageKey);
    if (!csrfToken) return;

    try {
      const response = await firstValueFrom(this.refreshSession());
      if (response.user) this.user.set(response.user);
      await firstValueFrom(this.loadCompanies());
    } catch {
      this.clearSession();
    }
  }

  signIn(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/signin`,
      { email, password },
      { withCredentials: true },
    ).pipe(tap((response) => this.setAuthenticated(response)));
  }

  signUp(email: string, password: string, displayName: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/signup`,
      { email, password, displayName },
      { withCredentials: true },
    ).pipe(tap((response) => this.setAuthenticated(response)));
  }

  loadCompanies(): Observable<Company[]> {
    return this.http.get<CompaniesResponse>(`${this.apiBaseUrl}/companies`, {
      headers: this.authorizationHeaders(),
    }).pipe(
      tap((response) => {
        const companies = response.companies.map((item) => item.company);
        this.companies.set(companies);
        this.restoreCompanySelection(companies);
      }),
      // A revoked membership should not leave the app looking authenticated.
      catchError((error: unknown) => {
        if (this.isUnauthorized(error)) this.clearSession();
        throw error;
      }),
    );
  }

  createCompany(legalName: string, displayName: string): Observable<CreateCompanyResponse> {
    return this.http.post<CreateCompanyResponse>(
      `${this.apiBaseUrl}/companies`,
      { legalName, displayName },
      { headers: this.authorizationHeaders() },
    ).pipe(
      tap((response) => {
        const company = response.company;
        this.companies.update((companies) => [...companies, company]);
        this.selectCompany(company.id);
      }),
    );
  }

  selectCompany(companyId: string): void {
    const company = this.companies().find((item) => item.id === companyId) ?? null;
    this.selectedCompany.set(company);
    if (company) sessionStorage.setItem(this.companyStorageKey, company.id);
    else sessionStorage.removeItem(this.companyStorageKey);
  }

  getAccessToken(): string {
    return this.accessTokenValue;
  }

  isAuthenticated(): boolean {
    return this.accessTokenValue.length > 0;
  }

  refreshSession(): Observable<AuthResponse> {
    const csrfToken = sessionStorage.getItem(this.csrfStorageKey);
    if (!csrfToken) {
      return of({ accessToken: '', csrfToken: '' });
    }

    return this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
      },
    ).pipe(tap((response) => this.setAuthenticated(response)));
  }

  async logout(): Promise<void> {
    const csrfToken = sessionStorage.getItem(this.csrfStorageKey);
    try {
      if (csrfToken) {
        await firstValueFrom(this.http.post(
          `${this.apiBaseUrl}/auth/logout`,
          {},
          {
            withCredentials: true,
            headers: new HttpHeaders({ 'X-CSRF-Token': csrfToken }),
          },
        ));
      }
    } finally {
      this.clearSession();
    }
  }

  private setAuthenticated(response: AuthResponse): void {
    this.accessTokenValue = response.accessToken;
    sessionStorage.setItem(this.csrfStorageKey, response.csrfToken);
    if (response.user) this.user.set(response.user);
  }

  private clearSession(): void {
    this.accessTokenValue = '';
    this.user.set(null);
    this.companies.set([]);
    this.selectedCompany.set(null);
    sessionStorage.removeItem(this.csrfStorageKey);
    sessionStorage.removeItem(this.companyStorageKey);
  }

  private restoreCompanySelection(companies: Company[]): void {
    const savedId = sessionStorage.getItem(this.companyStorageKey);
    const selected = companies.find((company) => company.id === savedId) ?? companies[0] ?? null;
    this.selectedCompany.set(selected);
    if (selected) sessionStorage.setItem(this.companyStorageKey, selected.id);
    else sessionStorage.removeItem(this.companyStorageKey);
  }

  private authorizationHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.accessTokenValue}` });
  }

  private isUnauthorized(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: unknown }).status === 401;
  }
}
