import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  LucideArrowRight,
  LucideBuilding2,
  LucideCheck,
  LucideLoaderCircle,
  LucideLogIn,
  LucidePlus,
  LucideShieldCheck,
} from '@lucide/angular';
import { AuthService } from '../services/auth.service';

type AuthMode = 'signin' | 'signup';

@Component({
  standalone: true,
  imports: [
    FormsModule,
    LucideArrowRight,
    LucideBuilding2,
    LucideCheck,
    LucideLoaderCircle,
    LucideLogIn,
    LucidePlus,
    LucideShieldCheck,
  ],
  template: `
    <main class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[100px]"></div>
        <div class="absolute inset-0 opacity-[0.055]" style="background-image: linear-gradient(rgb(167 139 250 / 0.45) 1px, transparent 1px), linear-gradient(90deg, rgb(167 139 250 / 0.45) 1px, transparent 1px); background-size: 48px 48px; mask-image: linear-gradient(to bottom, black, transparent 60%);"></div>
      </div>

      <section class="relative z-10 w-full max-w-5xl">
        <div class="mb-8 flex items-center justify-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300"><svg lucideBuilding2 [size]="19"></svg></span>
          <span class="text-base font-semibold tracking-wide text-white">LedgerLoop</span>
        </div>

        @if (!authenticated || setupRequired) {
          <div class="grid overflow-hidden rounded-3xl border border-white/8 bg-[var(--ll-surface)]/90 shadow-2xl shadow-black/30 lg:grid-cols-[1fr_0.85fr]">
            <div class="hidden border-r border-white/8 bg-white/[0.018] p-10 lg:block xl:p-12">
              <p class="ll-eyebrow">Accounting workspace</p>
              <h1 class="mt-4 max-w-md text-4xl font-semibold tracking-tight text-white">Run your business from one financial workspace.</h1>
              <p class="mt-5 max-w-md text-sm leading-6 text-[var(--ll-text-muted)]">LedgerLoop brings sales, purchases, inventory, receivables, payables and accounting activity into a single workspace.</p>
              <div class="mt-9 space-y-4">
                @for (item of benefits; track item) {
                  <div class="flex items-center gap-3 text-sm text-zinc-300"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><svg lucideCheck [size]="14"></svg></span>{{ item }}</div>
                }
              </div>
            </div>

            <div class="p-6 sm:p-8 xl:p-10">
              @if (setupRequired) {
                <div>
                  <p class="ll-eyebrow">Workspace setup</p>
                  <h2 class="mt-2 text-2xl font-semibold text-white">Create your company</h2>
                  <p class="mt-2 text-sm leading-6 text-[var(--ll-text-muted)]">Your account is ready. Create the first company workspace to open the dashboard.</p>
                  <form class="mt-7 space-y-5" (ngSubmit)="createCompany()">
                    <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Legal name</span><input class="ll-auth-input" name="legalName" [(ngModel)]="legalName" required maxlength="200" autocomplete="organization" placeholder="Your legal business name"></label>
                    <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Display name</span><input class="ll-auth-input" name="companyDisplayName" [(ngModel)]="companyDisplayName" required maxlength="120" autocomplete="organization" placeholder="How the company appears in LedgerLoop"></label>
                    @if (errorMessage) { <p class="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200">{{ errorMessage }}</p> }
                    <button class="ll-button-primary w-full" type="submit" [disabled]="loading || !legalName.trim() || !companyDisplayName.trim()">
                      @if (loading) { <svg class="animate-spin" lucideLoaderCircle [size]="16"></svg> } @else { <svg lucideArrowRight [size]="16"></svg> }
                      <span>{{ loading ? 'Creating workspace…' : 'Create company workspace' }}</span>
                    </button>
                  </form>
                </div>
              } @else {
                <div>
                  <div class="flex items-center justify-between gap-4">
                    <div><p class="ll-eyebrow">{{ mode === 'signin' ? 'Welcome back' : 'Get started' }}</p><h2 class="mt-2 text-2xl font-semibold text-white">{{ mode === 'signin' ? 'Sign in to LedgerLoop' : 'Create your account' }}</h2></div>
                    <span class="hidden h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300 sm:flex"><svg lucideLogIn [size]="18"></svg></span>
                  </div>
                  <div class="mt-6 grid grid-cols-2 rounded-xl border border-white/8 bg-white/[0.025] p-1">
                    <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold text-white transition" [style.background]="mode === 'signin' ? 'rgb(255 255 255 / 0.08)' : 'transparent'" (click)="setMode('signin')">Sign in</button>
                    <button type="button" class="rounded-lg px-3 py-2 text-xs font-semibold transition" [style.background]="mode === 'signup' ? 'rgb(255 255 255 / 0.08)' : 'transparent'" [style.color]="mode === 'signup' ? '#fff' : 'var(--ll-text-muted)'" (click)="setMode('signup')">Create account</button>
                  </div>
                  <form class="mt-6 space-y-4" (ngSubmit)="submitAuth()">
                    @if (mode === 'signup') {
                      <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Display name</span><input class="ll-auth-input" name="displayName" [(ngModel)]="displayName" required maxlength="120" autocomplete="name" placeholder="Your name"></label>
                    }
                    <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Email</span><input class="ll-auth-input" type="email" name="email" [(ngModel)]="email" required maxlength="254" autocomplete="email" placeholder="you@company.com"></label>
                    <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Password</span><input class="ll-auth-input" type="password" name="password" [(ngModel)]="password" required [minlength]="mode === 'signup' ? 12 : 1" maxlength="128" [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'" placeholder="{{ mode === 'signup' ? 'At least 12 characters' : 'Your password' }}"></label>
                    @if (errorMessage) { <p class="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200">{{ errorMessage }}</p> }
                    <button class="ll-button-primary mt-2 w-full" type="submit" [disabled]="loading || !email.trim() || !password">
                      @if (loading) { <svg class="animate-spin" lucideLoaderCircle [size]="16"></svg> } @else { <svg lucideArrowRight [size]="16"></svg> }
                      <span>{{ loading ? 'Signing you in…' : mode === 'signin' ? 'Sign in' : 'Create account' }}</span>
                    </button>
                  </form>
                  <div class="mt-6 flex items-center gap-2 text-[11px] text-[var(--ll-text-muted)]"><svg lucideShieldCheck [size]="14"></svg><span>Sessions use short-lived access tokens and protected refresh cookies.</span></div>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="mx-auto max-w-2xl rounded-3xl border border-white/8 bg-[var(--ll-surface)]/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
            <p class="ll-eyebrow">Company workspace</p>
            <div class="mt-2 flex items-end justify-between gap-4"><div><h1 class="text-2xl font-semibold text-white">Choose a company</h1><p class="mt-2 text-sm text-[var(--ll-text-muted)]">Select the workspace you want to open.</p></div><button class="ll-button-secondary" type="button" (click)="showCreateCompany = !showCreateCompany"><svg lucidePlus [size]="15"></svg>New company</button></div>
            @if (errorMessage) { <p class="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200">{{ errorMessage }}</p> }
            <div class="mt-6 space-y-3">
              @for (company of auth.companies(); track company.id) {
                <button type="button" class="flex w-full items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-left transition hover:border-violet-400/25 hover:bg-violet-500/[0.05]" (click)="chooseCompany(company.id)">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300"><svg lucideBuilding2 [size]="18"></svg></span>
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-white">{{ company.display_name }}</span><span class="mt-1 block truncate text-xs text-[var(--ll-text-muted)]">{{ company.legal_name }} · {{ company.base_currency }}</span></span>
                  <svg class="shrink-0 text-[var(--ll-text-muted)]" lucideArrowRight [size]="16"></svg>
                </button>
              }
            </div>
            @if (showCreateCompany) {
              <form class="mt-6 border-t border-white/8 pt-6 space-y-4" (ngSubmit)="createCompany()">
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Legal name</span><input class="ll-auth-input" name="multiLegalName" [(ngModel)]="legalName" required maxlength="200" autocomplete="organization" placeholder="Legal business name"></label>
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Display name</span><input class="ll-auth-input" name="multiDisplayName" [(ngModel)]="companyDisplayName" required maxlength="120" autocomplete="organization" placeholder="Workspace name"></label>
                <button class="ll-button-primary w-full" type="submit" [disabled]="loading || !legalName.trim() || !companyDisplayName.trim()">{{ loading ? 'Creating…' : 'Create company' }}</button>
              </form>
            }
          </div>
        }
      </section>
    </main>
  `,
  styles: [`:host { display: block; } .ll-auth-input { width: 100%; min-height: 44px; border: 1px solid var(--ll-border); border-radius: 0.75rem; background: rgb(255 255 255 / 0.025); color: #fff; padding: 0.65rem 0.8rem; font-size: 0.8125rem; outline: none; transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease; } .ll-auth-input::placeholder { color: #62626e; } .ll-auth-input:focus { border-color: rgb(167 139 250 / 0.45); background: rgb(255 255 255 / 0.04); box-shadow: 0 0 0 3px rgb(139 92 246 / 0.08); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPageComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected mode: AuthMode = 'signin';
  protected loading = false;
  protected authenticated = false;
  protected setupRequired = false;
  protected showCreateCompany = false;
  protected errorMessage = '';

  protected email = '';
  protected password = '';
  protected displayName = '';
  protected legalName = '';
  protected companyDisplayName = '';

  protected readonly benefits = [
    'Tenant-isolated company workspaces',
    'Accounting-aware financial reporting',
    'Receivables, payables and inventory visibility',
  ];

  ngOnInit(): void {
    this.authenticated = this.auth.isAuthenticated();
    if (this.authenticated) this.loadWorkspace();
  }

  protected setMode(mode: AuthMode): void {
    this.mode = mode;
    this.errorMessage = '';
  }

  protected submitAuth(): void {
    this.loading = true;
    this.errorMessage = '';
    const request$ = this.mode === 'signin'
      ? this.auth.signIn(this.email.trim(), this.password)
      : this.auth.signUp(this.email.trim(), this.password, this.displayName.trim());

    request$.subscribe({
      next: () => {
        this.authenticated = true;
        this.loadWorkspace();
      },
      error: (error: unknown) => {
        this.loading = false;
        this.errorMessage = this.readError(error, 'Unable to authenticate with LedgerLoop.');
      },
    });
  }

  protected chooseCompany(companyId: string): void {
    this.auth.selectCompany(companyId);
    void this.router.navigateByUrl('/dashboard');
  }

  protected createCompany(): void {
    this.loading = true;
    this.errorMessage = '';
    this.auth.createCompany(this.legalName.trim(), this.companyDisplayName.trim()).subscribe({
      next: () => {
        this.loading = false;
        void this.router.navigateByUrl('/dashboard');
      },
      error: (error: unknown) => {
        this.loading = false;
        this.errorMessage = this.readError(error, 'Unable to create the company workspace.');
      },
    });
  }

  private loadWorkspace(): void {
    this.auth.loadCompanies().subscribe({
      next: (companies) => {
        this.loading = false;
        this.authenticated = true;
        if (companies.length === 0) {
          this.setupRequired = true;
          return;
        }
        this.setupRequired = false;
        if (this.auth.selectedCompany()) void this.router.navigateByUrl('/dashboard');
      },
      error: (error: unknown) => {
        this.loading = false;
        this.authenticated = this.auth.isAuthenticated();
        this.errorMessage = this.readError(error, 'Unable to load your company workspaces.');
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) return message.join(', ');
      if (error.status === 0) return 'LedgerLoop API is unreachable. Make sure the API is running on port 3000.';
    }
    return fallback;
  }
}
