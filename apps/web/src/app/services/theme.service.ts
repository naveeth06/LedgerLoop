import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type LedgerLoopThemeId = 'default' | 'ocean' | 'emerald' | 'sunset' | 'indigo';

export interface LedgerLoopTheme {
  id: LedgerLoopThemeId;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  primarySoft: string;
  secondarySoft: string;
  focus: string;
}

const STORAGE_KEY = 'ledgerloop-theme';

export const LEDGERLOOP_THEMES: readonly LedgerLoopTheme[] = [
  {
    id: 'default',
    name: 'Violet Pulse',
    description: 'The original LedgerLoop palette',
    primary: '#8b5cf6',
    secondary: '#d946ef',
    primarySoft: '#a78bfa',
    secondarySoft: '#f0abfc',
    focus: '#c4b5fd',
  },
  {
    id: 'ocean',
    name: 'Ocean Signal',
    description: 'Deep navy with a crisp cyan accent',
    primary: '#0ea5e9',
    secondary: '#14b8a6',
    primarySoft: '#7dd3fc',
    secondarySoft: '#5eead4',
    focus: '#67e8f9',
  },
  {
    id: 'emerald',
    name: 'Emerald Ledger',
    description: 'Calm emerald with a refined teal accent',
    primary: '#10b981',
    secondary: '#0d9488',
    primarySoft: '#6ee7b7',
    secondarySoft: '#5eead4',
    focus: '#6ee7b7',
  },
  {
    id: 'sunset',
    name: 'Copper Sunset',
    description: 'Warm amber balanced by a restrained rose',
    primary: '#f59e0b',
    secondary: '#e11d48',
    primarySoft: '#fcd34d',
    secondarySoft: '#fda4af',
    focus: '#fde68a',
  },
  {
    id: 'indigo',
    name: 'Executive Blue',
    description: 'Confident blue paired with indigo depth',
    primary: '#3b82f6',
    secondary: '#6366f1',
    primarySoft: '#93c5fd',
    secondarySoft: '#a5b4fc',
    focus: '#bfdbfe',
  },
] as const;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly themes = LEDGERLOOP_THEMES;
  readonly activeTheme = signal<LedgerLoopTheme>(this.readInitialTheme());

  constructor() {
    this.applyTheme(this.activeTheme(), false);
  }

  setTheme(themeId: LedgerLoopThemeId): void {
    const theme = this.themes.find((candidate) => candidate.id === themeId) ?? this.themes[0];
    this.activeTheme.set(theme);
    this.applyTheme(theme, true);
  }

  private readInitialTheme(): LedgerLoopTheme {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY) as LedgerLoopThemeId | null;
      return this.themes.find((theme) => theme.id === stored) ?? this.themes[0];
    } catch {
      return this.themes[0];
    }
  }

  private applyTheme(theme: LedgerLoopTheme, persist: boolean): void {
    const root = this.document.documentElement;
    root.dataset['llTheme'] = theme.id;
    root.style.setProperty('--ll-primary', theme.primary);
    root.style.setProperty('--ll-secondary', theme.secondary);
    root.style.setProperty('--ll-primary-soft', theme.primarySoft);
    root.style.setProperty('--ll-secondary-soft', theme.secondarySoft);
    root.style.setProperty('--ll-focus', theme.focus);

    if (persist) {
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, theme.id);
      } catch {
        // Persistence is best-effort and must never block theme switching.
      }
    }
  }
}
