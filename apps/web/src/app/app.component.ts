import { DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideBarChart3, LucideBell, LucideBookOpen, LucideBoxes, LucideBuilding2, LucideCheck, LucideChevronDown, LucideCoins, LucideLandmark, LucideLayoutDashboard, LucideLogOut, LucideMenu, LucidePalette, LucideReceipt, LucideSettings, LucideShoppingCart, LucideUsers, LucideX } from '@lucide/angular';
import { filter } from 'rxjs';

import { AuthService } from './services/auth.service';
import { MotionService } from './services/motion.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'll-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideBarChart3, LucideBell, LucideBookOpen, LucideBoxes, LucideBuilding2, LucideCheck, LucideChevronDown, LucideCoins, LucideLandmark, LucideLayoutDashboard, LucideLogOut, LucideMenu, LucidePalette, LucideReceipt, LucideSettings, LucideShoppingCart, LucideUsers, LucideX],
  template: `
    <div class="min-h-screen bg-[var(--ll-bg)] text-[var(--ll-text)]">
      <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true"><div class="ll-ambient ll-ambient-purple"></div><div class="ll-grid"></div></div>

      @if (showShell()) {
        <aside class="ll-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r backdrop-blur-xl transition-transform duration-200" [class.-translate-x-full]="!sidebarOpen" [class.translate-x-0]="sidebarOpen">
          <div class="flex h-16 items-center justify-between border-b border-white/8 px-5">
            <a routerLink="/dashboard" class="flex items-center gap-3" (click)="closeSidebar()">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300"><svg lucideBuilding2 [size]="18"></svg></span>
              <span class="text-sm font-semibold tracking-wide text-white">LedgerLoop</span>
            </a>
            <button class="ll-icon-button" type="button" aria-label="Close navigation" title="Close navigation" (click)="closeSidebar()"><svg lucideX [size]="18"></svg></button>
          </div>
          <nav class="flex-1 space-y-7 overflow-y-auto px-3 py-6" aria-label="Primary navigation">
            <section><p class="ll-nav-label">Workspace</p><a routerLink="/dashboard" routerLinkActive="ll-nav-active" [routerLinkActiveOptions]="{ exact: true }" class="ll-nav-item" (click)="closeSidebar()"><svg lucideLayoutDashboard [size]="18"></svg><span>Dashboard</span></a></section>
            <section><p class="ll-nav-label">Accounting</p><a routerLink="/accounting/accounts" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideBookOpen [size]="18"></svg><span>Chart of Accounts</span></a><a routerLink="/accounting/parties" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideUsers [size]="18"></svg><span>Customers &amp; Suppliers</span></a><a routerLink="/accounting/items-warehouses" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideBoxes [size]="18"></svg><span>Items &amp; Warehouses</span></a></section>
            <section><p class="ll-nav-label">Sales</p><a routerLink="/sales/invoices" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideReceipt [size]="18"></svg><span>Invoices</span></a><a routerLink="/sales/receipts" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideCoins [size]="18"></svg><span>Receipts</span></a></section>
            <section><p class="ll-nav-label">Purchases</p><a routerLink="/purchases/bills" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideShoppingCart [size]="18"></svg><span>Bills</span></a><a routerLink="/purchases/payments" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideCoins [size]="18"></svg><span>Supplier Payments</span></a></section>
            <section><p class="ll-nav-label">Banking</p><a routerLink="/banking" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideLandmark [size]="18"></svg><span>Banking &amp; Reconciliation</span></a></section>
            <section><p class="ll-nav-label">Inventory</p><a routerLink="/inventory" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideBoxes [size]="18"></svg><span>Inventory</span></a></section>
            <section><p class="ll-nav-label">Reports</p><a routerLink="/reports" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideBarChart3 [size]="18"></svg><span>Reports</span></a></section>
            <section><p class="ll-nav-label">Collections</p><a routerLink="/reminders" routerLinkActive="ll-nav-active" class="ll-nav-item" (click)="closeSidebar()"><svg lucideBell [size]="18"></svg><span>Reminders</span></a></section>
            <section><p class="ll-nav-label">System</p><a href="#" class="ll-nav-item" (click)="$event.preventDefault()"><svg lucideSettings [size]="18"></svg><span>Settings</span></a></section>
          </nav>
          <div class="border-t border-white/8 p-4"><div class="rounded-xl border border-white/8 bg-white/[0.03] p-3"><p class="text-xs font-medium text-white">{{ auth.selectedCompany()?.display_name || 'Company workspace' }}</p><p class="mt-1 truncate text-xs text-[var(--ll-text-muted)]">{{ auth.user()?.email || 'Current company context' }}</p></div></div>
        </aside>
        @if (sidebarOpen) { <button class="ll-sidebar-scrim fixed inset-0 z-30 lg:hidden" type="button" aria-label="Close navigation overlay" (click)="closeSidebar()"></button> }
      }

      <div class="ll-sidebar-content" [class.ll-sidebar-open]="showShell() && sidebarOpen">
        @if (showShell()) {
          <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[var(--ll-bg)]/90 px-4 backdrop-blur-xl sm:px-6">
            <div class="flex min-w-0 items-center gap-3">
              <button class="ll-icon-button" type="button" [attr.aria-label]="sidebarOpen ? 'Close navigation' : 'Open navigation'" [attr.title]="sidebarOpen ? 'Close navigation' : 'Open navigation'" (click)="toggleSidebar()">
                @if (sidebarOpen) { <svg lucideX [size]="20"></svg> } @else { <svg lucideMenu [size]="20"></svg> }
              </button>
              <div class="hidden min-w-0 sm:block"><p class="truncate text-sm font-medium text-white">{{ auth.selectedCompany()?.display_name || 'LedgerLoop' }}</p><p class="text-xs text-[var(--ll-text-muted)]">Accounting workspace</p></div>
            </div>
            <div class="flex items-center gap-2">
              <div class="ll-theme-selector">
                <button class="ll-theme-trigger" type="button" aria-label="Change application theme" title="Change application theme" [attr.aria-expanded]="themeMenuOpen" aria-haspopup="true" (click)="themeMenuOpen = !themeMenuOpen">
                  <span class="ll-theme-swatch" [style.--swatch-primary]="themeService.activeTheme().primary" [style.--swatch-secondary]="themeService.activeTheme().secondary" aria-hidden="true"></span>
                  <span class="ll-theme-trigger-label hidden text-xs font-semibold sm:block">Theme</span>
                  <span class="hidden text-[11px] text-[var(--ll-text-muted)] lg:block">{{ themeService.activeTheme().name }}</span>
                  <svg class="text-[var(--ll-text-muted)]" lucidePalette [size]="15"></svg>
                </button>
                @if (themeMenuOpen) {
                  <div class="ll-theme-menu" role="menu" aria-label="Application themes">
                    <div class="ll-theme-menu-header"><p class="ll-theme-menu-title">Application theme</p><p class="ll-theme-menu-description">Choose the color system for the entire workspace.</p></div>
                    @for (theme of themes; track theme.id) {
                      <button type="button" role="menuitemradio" class="ll-theme-option" [class.ll-theme-option-active]="theme.id === themeService.activeTheme().id" [attr.aria-checked]="theme.id === themeService.activeTheme().id" (click)="selectTheme(theme.id)">
                        <span class="ll-theme-swatch" [style.--swatch-primary]="theme.primary" [style.--swatch-secondary]="theme.secondary" aria-hidden="true"></span>
                        <span class="ll-theme-option-copy"><span class="ll-theme-option-name">{{ theme.name }}</span><span class="ll-theme-option-description">{{ theme.description }}</span></span>
                        @if (theme.id === themeService.activeTheme().id) { <span class="ll-theme-check" aria-label="Selected"><svg lucideCheck [size]="14"></svg></span> }
                      </button>
                    }
                  </div>
                }
              </div>
              <button class="ll-icon-button" type="button" aria-label="Notifications" title="Notifications" routerLink="/reminders"><svg lucideBell [size]="18"></svg></button>
              <div class="relative"><button class="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-violet-400/20 hover:bg-white/[0.05]" type="button" aria-label="Open user menu" title="Open user menu" (click)="userMenuOpen = !userMenuOpen"><span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/80 to-fuchsia-500/70 text-xs font-semibold text-white">{{ initials }}</span><span class="hidden max-w-32 truncate text-xs font-medium text-white sm:block">{{ auth.user()?.displayName || 'Account' }}</span><svg class="hidden text-[var(--ll-text-muted)] sm:block" lucideChevronDown [size]="14"></svg></button>@if (userMenuOpen) {<div class="ll-user-menu absolute right-0 top-[calc(100%+8px)] w-52 rounded-xl border border-white/8 bg-[var(--ll-surface-elevated)] p-1.5 shadow-2xl shadow-black/40"><div class="px-3 py-2"><p class="truncate text-xs font-medium text-white">{{ auth.user()?.displayName || 'Account' }}</p><p class="mt-1 truncate text-[10px] text-[var(--ll-text-muted)]">{{ auth.user()?.email }}</p></div><button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-white" (click)="logout()"><svg lucideLogOut [size]="14"></svg>Sign out</button></div>}</div>
            </div>
          </header>
        }

        <div class="ll-route-progress" [class.ll-route-progress-active]="navigationPending()" aria-hidden="true"></div>
        <main class="relative min-h-screen"><div #routeStage class="ll-route-stage"><router-outlet></router-outlet></div></main>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit {
  protected readonly auth = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  protected readonly themes = this.themeService.themes;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly motion = inject(MotionService);
  @ViewChild('routeStage', { static: true }) private routeStage?: ElementRef<HTMLElement>;
  protected readonly showShell = signal(false);
  protected readonly navigationPending = signal(false);
  protected sidebarOpen = false;
  protected userMenuOpen = false;
  protected themeMenuOpen = false;

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError), takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const stage = this.routeStage?.nativeElement ?? null;

        if (event instanceof NavigationStart) {
          this.navigationPending.set(true);
          this.motion.routeLeave(stage);
          this.userMenuOpen = false;
          this.themeMenuOpen = false;
          this.showShell.set(false);
          this.sidebarOpen = false;
          return;
        }

        if (event instanceof NavigationEnd) {
          const isAuthRoute = event.urlAfterRedirects.startsWith('/auth');
          this.navigationPending.set(false);
          this.showShell.set(!isAuthRoute);
          this.sidebarOpen = !isAuthRoute && (this.document.defaultView?.innerWidth ?? 1024) >= 1024;
        } else {
          this.navigationPending.set(false);
          this.showShell.set(false);
          this.sidebarOpen = false;
        }

        this.motion.routeEnter(stage);
      });
  }

  ngAfterViewInit(): void {
    this.motion.initializeShell(this.document.body);
    requestAnimationFrame(() => this.motion.routeEnter(this.routeStage?.nativeElement ?? null));
  }

  protected get initials(): string {
    const name = this.auth.user()?.displayName?.trim() || this.auth.user()?.email || 'A';
    return name.slice(0, 1).toUpperCase();
  }

  protected openSidebar(): void { this.sidebarOpen = true; }
  protected closeSidebar(): void { this.sidebarOpen = false; }
  protected toggleSidebar(): void { this.sidebarOpen = !this.sidebarOpen; this.userMenuOpen = false; }
  protected selectTheme(themeId: 'default' | 'ocean' | 'emerald' | 'sunset' | 'indigo'): void { this.themeService.setTheme(themeId); this.themeMenuOpen = false; }
  protected async logout(): Promise<void> { this.userMenuOpen = false; this.closeSidebar(); await this.auth.logout(); await this.router.navigateByUrl('/auth'); }
}
