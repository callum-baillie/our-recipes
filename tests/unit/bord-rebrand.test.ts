import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  brandedKitchenTitle,
  brandedPageTitle,
  hasCustomKitchenIdentity,
  kitchenFooterCopy,
  legacyKitchenName,
} from '@/lib/brand';
import { BordIcon } from '@/components/bord-brand';
import { getRuntimeConfig } from '@/lib/config';
import { backupManifestSchema } from '@/lib/domain/backup';

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Bòrd brand identity', () => {
  it('combines a custom kitchen name with the fixed product brand', () => {
    expect(brandedKitchenTitle('Bòrd')).toBe('Bòrd');
    expect(brandedKitchenTitle('Callum’s Table')).toBe('Callum’s Table · Bòrd');
    expect(brandedPageTitle('Recipes', 'Callum’s Table')).toBe('Recipes · Callum’s Table · Bòrd');
    expect(kitchenFooterCopy('Bòrd')).toBe('Bòrd · Getting everyone to the table.');
    expect(kitchenFooterCopy('Callum’s Table')).toBe('Callum’s Table · Powered by Bòrd.');
  });

  it('uses the product lockup until the kitchen identity is customized', () => {
    expect(hasCustomKitchenIdentity('Bòrd', 'table')).toBe(false);
    expect(hasCustomKitchenIdentity('bord', 'table')).toBe(false);
    expect(hasCustomKitchenIdentity('Sunday suppers', 'table')).toBe(true);
    expect(hasCustomKitchenIdentity('Bòrd', 'cooking-pot')).toBe(true);
    const headerSource = readFileSync('src/components/app-header.tsx', 'utf8');
    expect(headerSource).toContain("showCustomKitchenIdentity ? 'custom-kitchen-wordmark'");
    expect(headerSource).toContain('<BordHeaderLockup />');
    expect(headerSource).toContain('<BrandIcon icon={resolvedKitchenIcon}');
  });

  it('maps legacy dual names into one kitchen identity', () => {
    expect(legacyKitchenName('Our Recipes', 'Sunday suppers')).toBe('Sunday suppers');
    expect(legacyKitchenName('Maya’s Recipe Box', 'Sunday suppers')).toBe('Maya’s Recipe Box');
    expect(legacyKitchenName('Our Recipes', 'Our kitchen')).toBe('Bòrd');
  });

  it('ships optimized, transparent and colorable SVG masters', () => {
    const icon = readFileSync('branding/icon.svg', 'utf8');
    const logo = readFileSync('branding/logo.svg', 'utf8');

    expect(readFileSync('public/brand/bord-mark.svg', 'utf8')).toBe(icon);
    expect(readFileSync('public/brand/bord-lockup.svg', 'utf8')).toBe(logo);
    expect(readFileSync('public/brand/bord-header-lockup.svg', 'utf8')).toContain(
      'viewBox="252 125 528 103"',
    );
    expect(icon).toContain('viewBox="0 0 1024 1024"');
    expect(logo).toContain('viewBox="0 0 1024 336"');
    for (const svg of [icon, logo]) {
      expect(svg).toContain('fill="currentColor"');
      expect(svg).not.toMatch(/<(?:image|rect)\b/iu);
      expect(svg).not.toMatch(/#fff(?:fff)?|\bwhite\b/iu);
      expect(svg).not.toMatch(/(?:Layer_1|enable-background|xml:space|xmlns:xlink)/u);
    }
  });

  it('exposes the table mark with Lucide-compatible sizing and color props', () => {
    const markup = renderToStaticMarkup(
      createElement(BordIcon, { size: 31, color: '#123456', className: 'test-mark' }),
    );

    expect(markup).toContain('width="31"');
    expect(markup).toContain('height="31"');
    expect(markup).toContain('fill="#123456"');
    expect(markup).toContain('lucide lucide-bord-table test-mark');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/<path d="([^"]+)"/u)?.[1]).toBe(
      readFileSync('branding/icon.svg', 'utf8').match(/<path\b[^>]*\bd="([^"]+)"/u)?.[1],
    );
  });

  it('ships favicon, Apple and Android exports at their platform sizes', async () => {
    const icons = [
      ['public/icons/favicon-16.png', 16],
      ['public/icons/favicon-32.png', 32],
      ['public/icons/favicon-48.png', 48],
      ['public/icons/apple-touch-icon-152x152.png', 152],
      ['public/icons/apple-touch-icon-167x167.png', 167],
      ['public/icons/apple-touch-icon.png', 180],
      ['public/icons/android-chrome-192x192.png', 192],
      ['public/icons/android-chrome-512x512.png', 512],
      ['public/icons/android-chrome-maskable-512x512.png', 512],
      ['public/icons/bord-app-icon-1024.png', 1024],
    ] as const;

    for (const [path, size] of icons) {
      await expect(sharp(path).metadata()).resolves.toMatchObject({
        format: 'png',
        width: size,
        height: size,
      });
    }
    expect(readFileSync('public/favicon.ico').subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
  });
});

describe('Bòrd compatibility', () => {
  it('continues to resolve an existing legacy database in local development', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bord-config-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'our-recipes.db'), 'database');
    writeFileSync(join(directory, 'our-recipes.db-wal'), 'wal');
    vi.stubEnv('DATA_DIR', directory);
    vi.stubEnv('DATABASE_URL', undefined);

    expect(getRuntimeConfig().databaseUrl).toBe(join(directory, 'our-recipes.db'));
    expect(existsSync(join(directory, 'our-recipes.db'))).toBe(true);
    expect(existsSync(join(directory, 'our-recipes.db-wal'))).toBe(true);
    expect(existsSync(join(directory, 'bord.db'))).toBe(false);
  });

  it('continues to validate version 1 backup manifests', () => {
    expect(
      backupManifestSchema.safeParse({
        formatVersion: 1,
        id: '123e4567-e89b-42d3-a456-426614174000',
        applicationVersion: '1.0.0',
        schemaVersion: '38',
        createdAt: '2026-07-21T12:00:00.000Z',
        reason: 'manual',
        files: [
          { path: 'database.sqlite', bytes: 1, sha256: 'a'.repeat(64) },
          { path: 'config.json', bytes: 1, sha256: 'b'.repeat(64) },
        ],
        safeConfiguration: { householdName: 'Sunday suppers', appName: 'Our Recipes' },
      }).success,
    ).toBe(true);
  });
});
