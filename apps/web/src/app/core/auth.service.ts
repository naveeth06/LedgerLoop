import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';

export interface LedgerLoopUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthResponse {
  user: LedgerLoopUser;
  accessToken: string;
  expiresIn: number;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly apiBaseUrl = 'http://localhost:3000/api';
  readonly user = signal<LedgerLoopUser | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly ready = signal(false);
  private initialization?: Promise<void>;
  private readonly http = inject(HttpClient);

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = firstValueFrom(this.restoreSession()).then(() => {
        this.ready.set(true);
      }).catch(() => {
        this.clearSession();
        this.ready.set(true);
      });
    }
    return this.initialization;
  }

  signIn(email: string, password: string): Promise<void> {
    return firstValueFrom(this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/signin`,
      { email, password },
      { withCredentials: true }
    )).then((response) => this.accept(response));
  }

  signUp(displayName: string, email: string, password: string): Promise<void> {
    return firstValueFrom(this.http.post<AuthResponse>(
      `${this.apiBaseUrl}/auth/signup`,
      { displayName, email, password },
      { withCredentials: true }
    )).then((response) => this.accept(response));
  }

  async signOut(): Promise<void> {
    const csrf = this.readCookie('ll_csrf');
    try {
      if (csrf) {
        await firstValueFrom(this.http.post<void>(
          `${this.apiBaseUrl}/auth/logout`,
          {},
          { withCredentials: true, headers: new HttpHeaders({ 'X-CSRF-Token': csrf }) }
        ));
      }
    } finally {
      this.clearSession();
    }
  }

  private restoreSession() {
    const csrf = this.readCookie('ll_csrf');
    if (!csrf) return of(null);
    return this.http.post<RefreshResponse>(
      `${this.apiBaseUrl}/auth/refresh`,
      {},
      { withCredentials: true, headers: new HttpHeaders({ 'X-CSRF-Token': csrf }) }
    ).pipe(
      tap((response) => this.accessToken.set(response.accessToken)),
      switchMap(() => this.http.get<{ user: LedgerLoopUser }>(
        `${this.apiBaseUrl}/auth/me`,
        { withCredentials: true }
      )),
      tap((response) => this.user.set(response.user)),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  private accept(response: AuthResponse): void {
    this.accessToken.set(response.accessToken);
    this.user.set(response.user);
    this.ready.set(true);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }

  private readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const prefix = `${name}=`;
    const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    if (!entry) return null;
    try {
      return decodeURIComponent(entry.slice(prefix.length));
    } catch {
      return null;
    }
  }
}