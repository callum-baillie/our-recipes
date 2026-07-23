import 'server-only';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

import { BRAND_ICON_COMPONENTS } from '@/components/brand-icon';
import { PALETTES, type BrandIconId, type PaletteId } from '@/lib/appearance';

export const BRAND_ICON_SIZES = [32, 180, 192, 512, 1024] as const;
export type BrandIconSize = (typeof BRAND_ICON_SIZES)[number];

export function isBrandIconSize(value: number): value is BrandIconSize {
  return BRAND_ICON_SIZES.includes(value as BrandIconSize);
}

type IconNode = readonly [string, Record<string, string | number>];

function escapeAttribute(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function iconNodes(icon: Exclude<BrandIconId, 'table'>): readonly IconNode[] {
  const component = BRAND_ICON_COMPONENTS[icon] as unknown as {
    render: (
      props: { size: number; strokeWidth: number },
      ref: null,
    ) => { props: { iconNode: readonly IconNode[] } };
  };
  return component.render({ size: 24, strokeWidth: 1.9 }, null).props.iconNode;
}

function serializeIconNodes(icon: Exclude<BrandIconId, 'table'>): string {
  const supportedTags = new Set([
    'circle',
    'ellipse',
    'line',
    'path',
    'polygon',
    'polyline',
    'rect',
  ]);
  return iconNodes(icon)
    .map(([tag, attributes]) => {
      if (!supportedTags.has(tag)) throw new Error(`Unsupported Lucide SVG element: ${tag}`);
      const serialized = Object.entries(attributes)
        .filter(([name]) => name !== 'key')
        .map(
          ([name, value]) =>
            `${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}="${escapeAttribute(value)}"`,
        )
        .join(' ');
      return `<${tag}${serialized ? ` ${serialized}` : ''}/>`;
    })
    .join('');
}

function bordTablePath(): string {
  const source = readFileSync(resolve(process.cwd(), 'public/brand/bord-mark.svg'), 'utf8');
  const path = source.match(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?\s*>/u)?.[1];
  if (!path) throw new Error('The Bòrd table mark could not be loaded.');
  return path;
}

export function brandIconSvg(palette: PaletteId, icon: BrandIconId): string {
  const colors = PALETTES[palette];
  if (icon === 'table') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${colors.label} table kitchen icon">
  <rect width="1024" height="1024" fill="${colors.brandBackground}"/>
  <path d="${bordTablePath()}" fill="#fffdf8"/>
</svg>`;
  }
  const mark = serializeIconNodes(icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${colors.label} kitchen icon">
  <rect width="1024" height="1024" fill="${colors.brandBackground}"/>
  <g transform="translate(202 180) scale(25.833333)" fill="none" stroke="#fffdf8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${mark}</g>
  <circle cx="790" cy="790" r="70" fill="${colors.brandAccent}" stroke="#fffdf8" stroke-width="18"/>
</svg>`;
}

export async function renderBrandIconPng(
  palette: PaletteId,
  icon: BrandIconId,
  size: BrandIconSize,
): Promise<{ data: Buffer; etag: string }> {
  const data = await sharp(Buffer.from(brandIconSvg(palette, icon)))
    .resize(size, size, { fit: 'fill' })
    .withMetadata({ density: 72 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const etag = `"${createHash('sha256').update(data).digest('base64url')}"`;
  return { data, etag };
}
