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
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  border: string;
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
    background: '#09090d',
    surface: '#101017',
    surfaceElevated: '#15151d',
    text: '#f4f4f5',
    textMuted: '#9a9aa7',
    border: 'rgba(255, 255, 255, 0.08)',
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
    background: '#06131b',
    surface: '#0a1c26',
    surfaceElevated: '#102833',
    text: '#ecfeff',
    textMuted: '#8aa9b3',
    border: 'rgba(103, 232, 249, 0.13)',
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
    background: '#06130f',
    surface: '#0a1e17',
    surfaceElevated: '#0f2a20',
    text: '#ecfdf5',
    textMuted: '#88a99b',
    border: 'rgba(110, 231, 183, 0.13)',
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
    background: '#160d08',
    surface: '#21120c',
    surfaceElevated: '#2b1710',
    text: '#fff7ed',
    textMuted: '#b99b88',
    border: 'rgba(253, 211, 77, 0.14)',
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
    background: '#080d1c',
    surface: '#0e1530',
    surfaceElevated: '#151d3d',
    text: '#eff6ff',
    textMuted: '#91a0bd',
    border: 'rgba(147, 197, 253, 0.13)',
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
    root.style.setProperty('--ll-bg', theme.background);
    root.style.setProperty('--ll-surface', theme.surface);
    root.style.setProperty('--ll-surface-elevated', theme.surfaceElevated);
    root.style.setProperty('--ll-text', theme.text);
    root.style.setProperty('--ll-text-muted', theme.textMuted);
    root.style.setProperty('--ll-border', theme.border);
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
