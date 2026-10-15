import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBell,
  LucideBuilding2,
  LucideChevronDown,
  LucideLayoutDashboard,
  LucideMenu,
  LucideSettings,
  LucideX,
} from '@lucide/angular';

@Component({
  selector: 'll-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideBell,
    LucideBuilding2,
    LucideChevronDown,
    LucideLayoutDashboard,
    LucideMenu,
    LucideSettings,
    LucideX,
  ],
  template: `
    <div class="min-h-screen bg-[var(--ll-bg)] text-[var(--ll-text)]">
      <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div class="ll-ambient ll-ambient-purple"></div>
        <div class="ll-grid"></div>
      </div>

      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/8 bg-[var(--ll-surface)]/90 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0"
        [class.-translate-x-full]="!sidebarOpen"
        [class.translate-x-0]="sidebarOpen"
      >
        <div class="flex h-16 items-center justify-between border-b border-white/8 px-5">
          <a routerLink="/dashboard" class="flex items-center gap-3" (click)="closeSidebar()">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-300">
              <svg lucideBuilding2 [size]="18"></svg>
            </span>
            <span class="text-sm font-semibold tracking-wide text-white">LedgerLoop</span>
          </a>
          <button class="ll-icon-button lg:hidden" type="button" aria-label="Close navigation" (click)="closeSidebar()">
            <svg lucideX [size]="18"></svg>
          </button>
        </div>

        <nav class="flex-1 space-y-7 overflow-y-auto px-3 py-6" aria-label="Primary navigation">
          <section>
            <p class="ll-nav-label">Workspace</p>
            <a
              routerLink="/dashboard"
              routerLinkActive="ll-nav-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="ll-nav-item"
              (click)="closeSidebar()"
            >
              <svg lucideLayoutDashboard [size]="18"></svg>
              <span>Dashboard</span>
            </a>
          </section>

          <section>
            <p class="ll-nav-label">System</p>
            <a href="#" class="ll-nav-item" (click)="$event.preventDefault()">
              <svg lucideSettings [size]="18"></svg>
              <span>Settings</span>
            </a>
          </section>
        </nav>

        <div class="border-t border-white/8 p-4">
          <div class="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p class="text-xs font-medium text-white">Company workspace</p>
            <p class="mt-1 truncate text-xs text-[var(--ll-text-muted)]">Current company context</p>
          </div>
        </div>
      </aside>

      @if (sidebarOpen) {
        <button
          class="fixed inset-0 z-30 bg-black/60 lg:hidden"
          type="button"
          aria-label="Close navigation overlay"
          (click)="closeSidebar()"
        ></button>
      }

      <div class="relative min-h-screen lg:pl-64">
        <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[var(--ll-bg)]/85 px-4 backdrop-blur-xl sm:px-6">
          <div class="flex min-w-0 items-center gap-3">
            <button class="ll-icon-button lg:hidden" type="button" aria-label="Open navigation" (click)="openSidebar()">
              <svg lucideMenu [size]="20"></svg>
            </button>
            <div class="hidden min-w-0 sm:block">
              <p class="truncate text-sm font-medium text-white">LedgerLoop</p>
              <p class="text-xs text-[var(--ll-text-muted)]">Accounting workspace</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button class="ll-icon-button" type="button" aria-label="Notifications">
              <svg lucideBell [size]="18"></svg>
            </button>
            <button class="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-violet-400/20 hover:bg-white/[0.05]" type="button" aria-label="Open user menu">
              <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/80 to-fuchsia-500/70 text-xs font-semibold text-white">N</span>
              <span class="hidden text-xs font-medium text-white sm:block">Account</span>
              <svg class="hidden text-[var(--ll-text-muted)] sm:block" lucideChevronDown [size]="14"></svg>
            </button>
          </div>
        </header>

        <main class="relative min-h-[calc(100vh-4rem)]">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  protected sidebarOpen = false;

  protected openSidebar(): void {
    this.sidebarOpen = true;
  }

  protected closeSidebar(): void {
    this.sidebarOpen = false;
  }
}
