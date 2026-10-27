import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export type PdfBrand = {
  /** Horizontal Bòrd lockup (mark and wordmark), trimmed, in the document ink colour. */
  lockup: string;
  lockupAspect: number;
  /** The table mark alone, for tight spaces. */
  mark: string;
  markAspect: number;
};

const ink = '#26372b';
let cached: Promise<PdfBrand> | null = null;

async function renderSvg(file: string, width: number) {
  const svg = (
    await readFile(path.join(process.cwd(), 'public', 'brand', file), 'utf8')
  ).replaceAll('currentColor', ink);
  // trim() removes the artwork's built-in padding so layout spacing is predictable.
  const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
    .resize({ width })
    .trim()
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    uri: `data:image/png;base64,${data.toString('base64')}`,
    aspect: info.width / info.height,
  };
}

/** The print identity is read from the shipped brand files once per process. */
export function getPdfBrand(): Promise<PdfBrand> {
  cached ??= Promise.all([
    renderSvg('bord-lockup.svg', 1200),
    renderSvg('bord-mark.svg', 400),
  ]).then(([lockup, mark]) => ({
    lockup: lockup.uri,
    lockupAspect: lockup.aspect,
    mark: mark.uri,
    markAspect: mark.aspect,
  }));
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
