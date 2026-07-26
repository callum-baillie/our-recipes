import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const projectRoot = resolve('.');
const sourceModules = resolve(projectRoot, 'node_modules');
const standaloneRoot = resolve(projectRoot, '.next/standalone');
const standaloneModules = resolve(standaloneRoot, 'node_modules');
const tracedExternalModules = resolve(standaloneRoot, '.next/node_modules');

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function assertWithin(parent, child, label) {
  if (!isWithin(parent, child)) {
    throw new Error(`${label} is outside the expected directory: ${child}`);
  }
}

function copyRuntimePath(source, target, label) {
  if (!existsSync(source)) {
    throw new Error(`Required standalone dependency is missing: ${label} (${source})`);
  }
  assertWithin(sourceModules, realpathSync(source), `${label} source`);
  assertWithin(standaloneRoot, target, `${label} target`);

  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    force: true,
  });
}

if (!existsSync(standaloneRoot)) {
  throw new Error('Standalone release artifact is missing. Run the Next.js build first.');
}

const runtimePaths = [
  'tesseract.js',
  'tesseract.js-core',
  '@tesseract.js-data',
  'sharp',
  '@img',
  '@napi-rs',
];

for (const path of runtimePaths) {
  copyRuntimePath(
    resolve(sourceModules, path),
    resolve(standaloneModules, path),
    `node_modules/${path}`,
  );
}

let hydratedExternals = 0;
if (existsSync(tracedExternalModules)) {
  for (const entry of readdirSync(tracedExternalModules)) {
    const target = resolve(tracedExternalModules, entry);
    if (!lstatSync(target).isSymbolicLink()) continue;

    const linkTarget = readlinkSync(target);
    const source = isAbsolute(linkTarget)
      ? resolve(linkTarget)
      : resolve(dirname(target), linkTarget);
    copyRuntimePath(source, target, `.next/node_modules/${entry}`);
    hydratedExternals += 1;
  }
}

console.log(
  `Standalone runtime dependencies hydrated: ${runtimePaths.length} runtime paths and ${hydratedExternals} traced externals`,
);
