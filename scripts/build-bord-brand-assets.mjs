import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { optimize } from 'svgo';

const workspace = resolve(import.meta.dirname, '..');
const sourceDirectory = resolve(workspace, 'branding');
const brandDirectory = resolve(workspace, 'public/brand');
const iconDirectory = resolve(workspace, 'public/icons');

const iconSourcePath = resolve(sourceDirectory, 'icon.svg');
const logoSourcePath = resolve(sourceDirectory, 'logo.svg');
const MARK_COLOR = '#fffdf8';
const BRAND_BACKGROUND = '#536938';

function attributes(element) {
  return Object.fromEntries(
    [...element.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)')/gu)].map((match) => [
      match[1].toLowerCase(),
      match[2] ?? match[3],
    ]),
  );
}

function removeWhiteCanvas(source) {
  const viewBox = source
    .match(/viewBox=(?:"([^"]+)"|'([^']+)')/u)
    ?.slice(1)
    .find(Boolean);
  const [, , viewWidth, viewHeight] = viewBox?.trim().split(/\s+/u).map(Number) ?? [];

  return source.replace(/<rect\b[^>]*\/?\s*>/giu, (element) => {
    const attrs = attributes(element);
    const fill = attrs.fill?.replaceAll(' ', '').toLowerCase();
    const isWhite = fill === '#fff' || fill === '#ffffff' || fill === 'white';
    const startsAtOrigin =
      (!attrs.x || Number(attrs.x) === 0) && (!attrs.y || Number(attrs.y) === 0);
    const coversWidth = attrs.width === '100%' || Number(attrs.width) === viewWidth;
    const coversHeight = attrs.height === '100%' || Number(attrs.height) === viewHeight;
    return isWhite && startsAtOrigin && coversWidth && coversHeight ? '' : element;
  });
}

function optimizeBrandSvg(source, path) {
  const transparentSource = removeWhiteCanvas(source)
    .replace(/\s+xml:space=("|')[^"']*\1/giu, '')
    .replace(/fill=("|')#(?:000000|000)\1/giu, 'fill="currentColor"')
    .replace(/fill=("|')black\1/giu, 'fill="currentColor"');
  const result = optimize(transparentSource, {
    path,
    multipass: true,
    js2svg: { pretty: false },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            collapseGroups: false,
            convertPathData: { floatPrecision: 4 },
            mergePaths: false,
          },
        },
      },
      'removeDimensions',
    ],
  });
  if (!result.data.includes('viewBox='))
    throw new Error(`${path} lost its viewBox during optimization.`);
  if (/fill=("|')(?:#fff(?:fff)?|white)\1/iu.test(result.data)) {
    throw new Error(`${path} still contains a white fill after background removal.`);
  }
  return `${result.data}\n`;
}

async function rasterizeTransparent(svg, outputPath, width, height) {
  await sharp(Buffer.from(svg.replaceAll('currentColor', '#000000')))
    .resize(width, height, { fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function markLayer(markSvg, size, coverage) {
  const source = await sharp(Buffer.from(markSvg.replaceAll('currentColor', MARK_COLOR)))
    .resize(1024, 1024, { fit: 'fill' })
    .png()
    .toBuffer();
  const trimmed = await sharp(source)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp(trimmed)
    .resize(Math.round(size * coverage), Math.round(size * coverage), {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function createInstallIcon(markSvg, outputPath, size, coverage = 0.72) {
  const mark = await markLayer(markSvg, size, coverage);
  const metadata = await sharp(mark).metadata();
  const width = metadata.width ?? size;
  const height = metadata.height ?? size;
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND_BACKGROUND } })
    .composite([
      {
        input: mark,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function main() {
  await Promise.all([
    mkdir(sourceDirectory, { recursive: true }),
    mkdir(brandDirectory, { recursive: true }),
    mkdir(iconDirectory, { recursive: true }),
    mkdir(resolve(workspace, 'src/app'), { recursive: true }),
  ]);

  const [iconSource, logoSource] = await Promise.all([
    readFile(iconSourcePath, 'utf8'),
    readFile(logoSourcePath, 'utf8'),
  ]);
  const markSvg = optimizeBrandSvg(iconSource, iconSourcePath);
  const lockupSvg = optimizeBrandSvg(logoSource, logoSourcePath);
  const headerLockupSvg = lockupSvg.replace('viewBox="0 0 1024 336"', 'viewBox="252 125 528 103"');

  await Promise.all([
    writeFile(iconSourcePath, markSvg, 'utf8'),
    writeFile(logoSourcePath, lockupSvg, 'utf8'),
    writeFile(resolve(brandDirectory, 'bord-mark.svg'), markSvg, 'utf8'),
    writeFile(resolve(brandDirectory, 'bord-lockup.svg'), lockupSvg, 'utf8'),
    writeFile(resolve(brandDirectory, 'bord-header-lockup.svg'), headerLockupSvg, 'utf8'),
    rasterizeTransparent(markSvg, resolve(brandDirectory, 'bord-mark-1024.png'), 1024, 1024),
    rasterizeTransparent(lockupSvg, resolve(brandDirectory, 'bord-lockup.png'), 1600, 525),
  ]);

  const iconTargets = [
    ['bord-app-icon-1024.png', 1024, 0.72],
    ['bord-app-icon-512.png', 512, 0.72],
    ['bord-app-icon-192.png', 192, 0.72],
    ['android-chrome-512x512.png', 512, 0.72],
    ['android-chrome-192x192.png', 192, 0.72],
    ['android-chrome-maskable-512x512.png', 512, 0.58],
    ['apple-touch-icon.png', 180, 0.72],
    ['apple-touch-icon-167x167.png', 167, 0.72],
    ['apple-touch-icon-152x152.png', 152, 0.72],
    ['favicon-48.png', 48, 0.82],
    ['favicon-32.png', 32, 0.82],
    ['favicon-16.png', 16, 0.84],
    ['bord-mark-64.png', 64, 0.8],
  ];
  await Promise.all(
    iconTargets.map(([name, size, coverage]) =>
      createInstallIcon(markSvg, resolve(iconDirectory, name), size, coverage),
    ),
  );
  await Promise.all([
    createInstallIcon(markSvg, resolve(workspace, 'src/app/icon.png'), 512),
    createInstallIcon(markSvg, resolve(workspace, 'src/app/apple-icon.png'), 180),
  ]);

  const favicon = await pngToIco([
    resolve(iconDirectory, 'favicon-16.png'),
    resolve(iconDirectory, 'favicon-32.png'),
    resolve(iconDirectory, 'favicon-48.png'),
  ]);
  await Promise.all([
    writeFile(resolve(workspace, 'public/favicon.ico'), favicon),
    writeFile(resolve(workspace, 'src/app/favicon.ico'), favicon),
  ]);
}

await main();
