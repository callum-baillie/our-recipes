'use client';

import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition, useSyncExternalStore } from 'react';

import {
  APPEARANCE_COOKIE_KEYS,
  APPEARANCE_STORAGE_KEYS,
  LEGACY_APPEARANCE_STORAGE_KEYS,
  COLOR_MODES,
  PALETTE_IDS,
  PALETTES,
  parseColorMode,
  parsePalette,
  type ColorMode,
  type PaletteId,
} from '@/lib/appearance';

const APPEARANCE_EVENT = 'bord-theme-change';
const SERVER_SNAPSHOT = 'green:system:light';

function appearanceSnapshot(): string {
  const palette = parsePalette(
    window.localStorage.getItem(APPEARANCE_STORAGE_KEYS.palette) ??
      window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEYS.palette),
  );
  const storedTheme =
    window.localStorage.getItem(APPEARANCE_STORAGE_KEYS.theme) ??
    window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEYS.theme);
  const mode = parseColorMode(
    storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null,
  );
  const effective =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  return `${palette}:${mode}:${effective}`;
}

function subscribeToAppearance(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener(APPEARANCE_EVENT, onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener(APPEARANCE_EVENT, onChange);
  };
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function applyAppearance(palette: PaletteId, mode: ColorMode) {
  document.documentElement.dataset.palette = palette;
  window.localStorage.setItem(APPEARANCE_STORAGE_KEYS.palette, palette);
  setCookie(APPEARANCE_COOKIE_KEYS.palette, palette);

  if (mode === 'system') {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = 'light dark';
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEYS.theme);
  } else {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    window.localStorage.setItem(APPEARANCE_STORAGE_KEYS.theme, mode);
  }
  setCookie(APPEARANCE_COOKIE_KEYS.mode, mode);
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

function AppearanceChoices({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(
    subscribeToAppearance,
    appearanceSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const [palette, mode, effectiveMode] = snapshot.split(':') as [
    PaletteId,
    ColorMode,
    'light' | 'dark',
  ];

  function changePalette(nextPalette: PaletteId) {
    applyAppearance(nextPalette, mode);
    startTransition(() => router.refresh());
  }

  function changeMode(nextMode: ColorMode) {
    applyAppearance(palette, nextMode);
    startTransition(() => router.refresh());
  }

  return (
    <div className={compact ? 'appearance-choices compact' : 'appearance-choices'}>
      <fieldset>
        <legend>Color theme</legend>
        <div className="appearance-palette-grid" role="radiogroup" aria-label="Color theme">
          {PALETTE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={palette === id}
              className={palette === id ? 'appearance-palette selected' : 'appearance-palette'}
              title={PALETTES[id].label}
              onClick={() => changePalette(id)}
            >
              <span
                className="appearance-palette-swatch"
                style={
                  {
                    '--palette-primary': PALETTES[id].brandBackground,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                {palette === id ? (
                  <span className="appearance-palette-check">
                    <Check size={13} strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span>{PALETTES[id].label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Light or dark</legend>
        <div className="appearance-mode-grid" role="radiogroup" aria-label="Light or dark">
          {COLOR_MODES.map((id) => {
            const Icon = id === 'system' ? Monitor : id === 'dark' ? Moon : Sun;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className={mode === id ? 'appearance-mode selected' : 'appearance-mode'}
                onClick={() => changeMode(id)}
              >
                <Icon size={16} aria-hidden="true" />
                {id === 'system'
                  ? `System (${effectiveMode})`
                  : `${id[0]!.toUpperCase()}${id.slice(1)}`}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function ThemeToggle() {
  return (
    <details className="appearance-menu">
      <summary
        className="settings-button"
        role="button"
        aria-label="Change color theme"
        title="Appearance"
      >
        <Palette size={19} aria-hidden="true" />
      </summary>
      <div className="appearance-menu-panel">
        <div>
          <p className="eyebrow">APPEARANCE</p>
          <h2>Set the mood.</h2>
          <p>Color and brightness are saved for this browser.</p>
        </div>
        <AppearanceChoices compact />
      </div>
    </details>
  );
}

export function AppearanceSettings() {
  return (
    <section className="settings-card appearance-settings">
      <div>
        <p className="eyebrow">APPEARANCE</p>
        <h2>Choose your kitchen colors.</h2>
        <p>These choices apply only to this browser. The kitchen icon above is shared.</p>
      </div>
      <AppearanceChoices />
    </section>
  );
}
