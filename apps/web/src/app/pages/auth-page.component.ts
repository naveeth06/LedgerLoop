import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { LucideArrowRight, LucideCheck, LucideCircleDollarSign, LucideLoaderCircle, LucideShieldCheck } from '@lucide/angular';
import { AuthService } from '../services/auth.service';

type AuthMode = 'signin' | 'signup';

@Component({
  selector: 'll-auth-page',
  standalone: true,
  imports: [FormsModule, LucideArrowRight, LucideCheck, LucideCircleDollarSign, LucideLoaderCircle, LucideShieldCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-[var(--ll-bg)] text-[var(--ll-text)]">
      <div class="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.05fr_.95fr]">
        <section class="hidden flex-col justify-center px-10 py-12 lg:flex xl:px-16">
          <div class="max-w-xl">
            <div class="flex items-center gap-3"><span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideCircleDollarSign [size]="22"></svg></span><span class="text-sm font-semibold tracking-tight text-white">LedgerLoop</span></div>
            <p class="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Accounting, without the friction</p>
            <h1 class="mt-4 text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-white xl:text-6xl">Run your business from one financial workspace.</h1>
            <p class="mt-6 max-w-lg text-base leading-7 text-[var(--ll-text-muted)]">Invoices, purchases, inventory, banking and reports stay connected to the same accounting truth.</p>
            <div class="mt-10 space-y-4">@for (benefit of benefits; track benefit) { <div class="flex items-center gap-3 text-sm text-zinc-300"><span class="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><svg lucideCheck [size]="13"></svg></span>{{ benefit }}</div> }</div>
          </div>
        </section>

        <section class="flex min-h-screen items-center justify-center border-l border-white/6 px-4 py-8 sm:px-8">
          <div class="w-full max-w-md rounded-3xl border border-white/8 bg-[var(--ll-surface)]/85 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
            @if (setupRequired) {
              <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideCircleDollarSign [size]="19"></svg></div>
              <p class="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Workspace setup</p>
              <h2 class="mt-2 text-2xl font-semibold text-white">Create your company</h2>
              <p class="mt-2 text-sm leading-6 text-[var(--ll-text-muted)]">Your account is ready. Create the first company workspace to open the dashboard.</p>
              <form class="mt-7 space-y-5" (ngSubmit)="createCompany()">
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Legal name</span><input class="ll-auth-input" name="legalName" [(ngModel)]="legalName" required maxlength="200" autocomplete="organization" placeholder="e.g. Acme Technologies Private Limited"></label>
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Display name</span><input class="ll-auth-input" name="companyDisplayName" [(ngModel)]="companyDisplayName" required maxlength="120" autocomplete="organization" placeholder="e.g. Acme Technologies"></label>
                @if (errorMessage) { <p class="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200" role="alert">{{ errorMessage }}</p> }
                <button class="ll-button-primary w-full" type="submit" [disabled]="loading || !legalName.trim() || !companyDisplayName.trim()">
                  @if (loading) { <svg class="animate-spin" lucideLoaderCircle [size]="16"></svg> } @else { <svg lucideArrowRight [size]="16"></svg> }
                  <span>{{ loading ? 'Creating company…' : 'Create company' }}</span>
                </button>
              </form>
            } @else if (authenticated && companies.length > 0) {
              <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideCircleDollarSign [size]="19"></svg></div>
              <p class="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Your workspaces</p>
              <h2 class="mt-2 text-2xl font-semibold text-white">Choose a company</h2>
              <p class="mt-2 text-sm leading-6 text-[var(--ll-text-muted)]">Select the workspace you want to open.</p>
              <div class="mt-6 space-y-2">@for (company of companies; track company.id) { <button type="button" class="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-left transition hover:border-violet-400/25 hover:bg-violet-400/[0.05]" (click)="chooseCompany(company.id)"><span><span class="block text-sm font-medium text-white">{{ company.display_name }}</span><span class="mt-1 block text-xs text-zinc-500">{{ company.legal_name }}</span></span><svg lucideArrowRight [size]="15" class="text-zinc-500"></svg></button> }</div>
            } @else {
              <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><svg lucideCircleDollarSign [size]="19"></svg></div>
              <p class="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">{{ mode === 'signup' ? 'Get started' : 'Welcome back' }}</p>
              <h2 class="mt-2 text-2xl font-semibold text-white">{{ mode === 'signup' ? 'Create your account' : 'Sign in to LedgerLoop' }}</h2>
              <p class="mt-2 text-sm leading-6 text-[var(--ll-text-muted)]">{{ mode === 'signup' ? 'Create your account, then set up your first company workspace.' : 'Continue to your accounting workspace.' }}</p>
              <form class="mt-6 space-y-4" (ngSubmit)="submitAuth()">
                @if (mode === 'signup') { <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Display name</span><input class="ll-auth-input" name="displayName" [(ngModel)]="displayName" required maxlength="120" autocomplete="name" placeholder="e.g. Naveeth Imran"></label> }
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Email</span><input class="ll-auth-input" type="email" name="email" [(ngModel)]="email" required maxlength="254" autocomplete="email" placeholder="name@company.com"></label>
                <label class="block"><span class="mb-2 block text-xs font-medium text-zinc-300">Password</span><input class="ll-auth-input" type="password" name="password" [(ngModel)]="password" required [minlength]="mode === 'signup' ? 12 : 1" maxlength="128" [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'" [placeholder]="mode === 'signup' ? 'At least 12 characters' : 'Enter your password'"></label>
                @if (errorMessage) { <p class="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200" role="alert">{{ errorMessage }}</p> }
                <button class="ll-button-primary mt-2 w-full" type="submit" [disabled]="loading || !email.trim() || !password">
                  @if (loading) { <svg class="animate-spin" lucideLoaderCircle [size]="16"></svg> } @else { <svg lucideArrowRight [size]="16"></svg> }
                  <span>{{ loading ? (mode === 'signup' ? 'Creating account…' : 'Signing you in…') : mode === 'signin' ? 'Sign in' : 'Create account' }}</span>
                </button>
              </form>
              <div class="mt-6 flex items-center gap-2 text-[11px] text-[var(--ll-text-muted)]"><svg lucideShieldCheck [size]="14"></svg><span>Sessions use short-lived access tokens and protected refresh cookies.</span></div>
              <button type="button" class="mt-5 w-full text-xs font-medium text-zinc-400 hover:text-white" (click)="setMode(mode === 'signin' ? 'signup' : 'signin')">{{ mode === 'signin' ? 'Create a new account' : 'Already have an account? Sign in' }}</button>
            }
          </div>
        </section>
      </div>
    </main>
  `,
  styles: [`
    :host { display:block; }
    .ll-auth-input { min-height:2.75rem; width:100%; border:1px solid var(--ll-border); border-radius:.8rem; background:color-mix(in srgb,var(--ll-text) 2.5%,transparent); color:var(--ll-text); padding:.7rem .8rem; outline:none; font-size:.8rem; transition:border-color 180ms ease,background-color 180ms ease,box-shadow 180ms ease; }
    .ll-auth-input::placeholder { color:#6f6f7b; opacity:1; }
    .ll-auth-input:focus { border-color:color-mix(in srgb,var(--ll-primary-soft) 45%,transparent); background:color-mix(in srgb,var(--ll-text) 4%,transparent); box-shadow:0 0 0 3px color-mix(in srgb,var(--ll-primary) 9%,transparent); }
  `],
})
export class AuthPageComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected mode: AuthMode = 'signin';
  protected loading = false;
  protected authenticated = false;
  protected setupRequired = false;
  protected companies = [] as Array<{ id: string; legal_name: string; display_name: string; base_currency: string; created_at: string }>;
  protected email = '';
  protected password = '';
  protected displayName = '';
  protected legalName = '';
  protected companyDisplayName = '';

  protected readonly benefits = ['Tenant-isolated company workspaces', 'Accounting-aware financial reporting', 'Receivables, payables and inventory visibility'];

  ngOnInit(): void {
    this.authenticated = this.auth.isAuthenticated();
    if (this.authenticated) this.loadWorkspace();
    this.cdr.markForCheck();
  }

  protected setMode(mode: AuthMode): void { this.mode = mode; this.errorMessage = ''; this.cdr.markForCheck(); }
  protected errorMessage = '';

  protected submitAuth(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();
    if (this.mode === 'signup') {
      this.auth.signUp(this.email.trim(), this.password, this.displayName.trim()).subscribe({
        next: () => {
          this.loading = false;
          this.authenticated = true;
          this.setupRequired = true;
          this.companies = [];
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.loading = false;
          this.errorMessage = this.readError(error, 'Unable to create your account.');
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.auth.signIn(this.email.trim(), this.password).subscribe({
      next: () => {
        this.authenticated = true;
        this.loadWorkspace();
      },
      error: (error: unknown) => {
        this.loading = false;
        this.errorMessage = this.readError(error, 'Unable to authenticate with LedgerLoop.');
        this.cdr.markForCheck();
      },
    });
  }

  protected chooseCompany(companyId: string): void { this.auth.selectCompany(companyId); void this.router.navigateByUrl('/dashboard'); }

  protected createCompany(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();
    this.auth.createCompany(this.legalName.trim(), this.companyDisplayName.trim()).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.markForCheck();
        void this.router.navigateByUrl('/dashboard');
      },
      error: (error: unknown) => {
        this.loading = false;
        this.errorMessage = this.readError(error, 'Unable to create the company workspace.');
        this.cdr.markForCheck();
      },
    });
  }

  private loadWorkspace(): void {
    this.auth.loadCompanies().subscribe({
      next: (companies) => {
        this.loading = false;
        this.authenticated = true;
        this.companies = companies;
        this.setupRequired = companies.length === 0;
        this.cdr.markForCheck();
        if (this.auth.selectedCompany()) void this.router.navigateByUrl('/dashboard');
      },
      error: (error: unknown) => {
        this.loading = false;
        this.authenticated = this.auth.isAuthenticated();
        this.errorMessage = this.readError(error, 'Unable to load your company workspaces.');
        this.cdr.markForCheck();
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
    return fallback;
  }
}
