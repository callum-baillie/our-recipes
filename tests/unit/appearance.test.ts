import { readFileSync } from 'node:fs';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BRAND_ICON_COMPONENTS } from '@/components/brand-icon';
import {
  BRAND_ICON_IDS,
  PALETTE_IDS,
  PALETTES,
  brandIconIdSchema,
  parseBrandIcon,
  parseColorMode,
  parsePalette,
} from '@/lib/appearance';
import { brandIconSvg, renderBrandIconPng } from '@/lib/branding-icon-renderer';

describe('appearance system', () => {
  it('keeps green as the default and rejects unknown stored values', () => {
    expect(parsePalette(null)).toBe('green');
    expect(parsePalette('purple')).toBe('purple');
    expect(parsePalette('neon')).toBe('green');
    expect(parseColorMode(null)).toBe('system');
    expect(parseColorMode('dark')).toBe('dark');
    expect(parseColorMode('sepia')).toBe('system');
    expect(parseBrandIcon(null)).toBe('table');
    expect(brandIconIdSchema.safeParse('whisk').success).toBe(false);
  });

  it('exposes every verified culinary icon exactly once', () => {
    expect(BRAND_ICON_IDS).toHaveLength(60);
    expect(new Set(BRAND_ICON_IDS)).toHaveLength(60);
    expect(Object.keys(BRAND_ICON_COMPONENTS).sort()).toEqual(
      BRAND_ICON_IDS.filter((icon) => icon !== 'table').sort(),
    );
  });

  it('defines light, dark, and install-icon colors for every palette', () => {
    expect(Object.keys(PALETTES)).toEqual([...PALETTE_IDS]);
    for (const palette of PALETTE_IDS) {
      expect(PALETTES[palette].brandBackground).toMatch(/^#[0-9a-f]{6}$/u);
      expect(PALETTES[palette].brandAccent).toMatch(/^#[0-9a-f]{6}$/u);
      expect(PALETTES[palette].light.primary).not.toBe(PALETTES[palette].dark.primary);
      expect(PALETTES[palette].light.primary).not.toBe(PALETTES[palette].light.secondary);
      expect(PALETTES[palette].dark.primary).not.toBe(PALETTES[palette].dark.secondary);
      expect(PALETTES[palette].brandBackground).toBe(PALETTES[palette].light.primary);
      expect(PALETTES[palette].brandAccent).toBe(PALETTES[palette].light.accent);
    }
  });

  it('renders circular palette swatches before the light and dark selector', () => {
    const source = readFileSync('src/components/theme-toggle.tsx', 'utf8');
    const css = readFileSync('src/app/themes.css', 'utf8');
    expect(source.indexOf('<legend>Color theme</legend>')).toBeLessThan(
      source.indexOf('<legend>Light or dark</legend>'),
    );
    expect(source).toContain('className="appearance-palette-check"');
    expect(source).toContain("'--palette-primary': PALETTES[id].brandBackground");
    expect(source).not.toContain("'--palette-secondary'");
    expect(source).not.toContain("'--palette-accent'");
    expect(css).toContain('background: var(--palette-primary)');
    expect(css).not.toContain('background: conic-gradient(');
    expect(css).toContain('border-radius: 50%');
    expect(css).toContain('.appearance-choices fieldset + fieldset');
  });

  it('preserves the existing green surface values behind semantic aliases', () => {
    const css = readFileSync('src/app/themes.css', 'utf8');
    expect(css).toContain('--primary: light-dark(#536938, #b8d38d)');
    expect(css).toContain('--page: light-dark(#faf7f0, #202920)');
    expect(css).toContain('--linen: light-dark(#fffdf8, #273127)');
    expect(css).toContain('--tomato: var(--accent)');
    expect(css).toContain('--leaf: var(--primary)');
  });

  it('uses routable extensionless URLs for generated metadata icons', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    const manifest = readFileSync('src/app/manifest.ts', 'utf8');
    expect(layout).toContain('/${icon}/${size}`');
    expect(manifest).toContain('/${icon}/${size}`');
    expect(layout).not.toContain('/${icon}/${size}.png`');
    expect(manifest).not.toContain('/${icon}/${size}.png`');
  });

  it('renders deterministic, correctly sized PNG install artwork', async () => {
    const svg = brandIconSvg('blue', 'cooking-pot');
    expect(svg).toContain(PALETTES.blue.brandBackground);
    expect(svg).toContain(PALETTES.blue.brandAccent);
    expect(svg).toContain('M20 12v8');

    const first = await renderBrandIconPng('blue', 'cooking-pot', 192);
    const second = await renderBrandIconPng('blue', 'cooking-pot', 192);
    const metadata = await sharp(first.data).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 192, height: 192 });
    expect(first.etag).toBe(second.etag);
    expect(first.data.equals(second.data)).toBe(true);
  });
});
