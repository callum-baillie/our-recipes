import { access, lstat, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const target = resolve(process.argv[2] ?? '.next/standalone');
const projectName = process.cwd().split(/[\\/]/).at(-1)?.toLocaleLowerCase() ?? '';
const forbiddenExtensions = /\.(?:db|sqlite)(?:-(?:shm|wal))?$/i;
const forbiddenSecretName = /(?:^|\/)\.env(?:\..*)?$|(?:^|\/)\.api_keys(?:\/|$)/i;
const projectOnlyDirectories = new Set([
  '.git',
  '.test-data',
  'coverage',
  'data',
  'docs',
  'playwright-report',
  'src',
  'test-results',
  'tests',
]);

function slash(path) {
  return path.split(sep).join('/');
}

function isProjectPath(path) {
  const parts = path.toLocaleLowerCase().split('/');
  const projectIndex = parts.lastIndexOf(projectName);
  return projectIndex >= 0 ? parts.slice(projectIndex + 1) : parts;
}

function violation(path) {
  const normalized = slash(path);
  const lowered = normalized.toLocaleLowerCase();
  if (forbiddenExtensions.test(lowered)) return 'database file';
  if (forbiddenSecretName.test(lowered)) return 'environment or provider credential file';
  const projectPath = isProjectPath(lowered);
  if (projectPath[0] !== 'node_modules' && projectOnlyDirectories.has(projectPath[0])) {
    return 'project data, source, documentation, or test path';
  }
  if (projectPath.at(-1) === 'v1-roadmap.md') return 'internal release planning document';
  return null;
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    const details = await lstat(absolutePath);
    if (details.isSymbolicLink()) {
      throw new Error(
        `Release artifact contains a non-portable symbolic link: ${slash(relative(target, absolutePath))}`,
      );
    }
    if (details.isDirectory()) await walk(absolutePath, files);
    else if (details.isFile()) files.push(absolutePath);
  }
}

const files = [];
try {
  await walk(target, files);
} catch (error) {
  if (error?.code === 'ENOENT') {
    throw new Error(`Release artifact does not exist: ${target}`);
  }
  throw error;
}

const violations = files.flatMap((file) => {
  const reason = violation(relative(target, file));
  return reason ? [`${slash(relative(target, file))} (${reason})`] : [];
});

if (violations.length) {
  throw new Error(
    `Release artifact contains forbidden files:\n${violations.slice(0, 50).join('\n')}${
      violations.length > 50 ? `\n...and ${violations.length - 50} more` : ''
    }`,
  );
}

const requiredRuntimeFiles = [
  'node_modules/tesseract.js/src/index.js',
  'node_modules/tesseract.js/src/worker-script/node/index.js',
  'node_modules/tesseract.js-core/tesseract-core.wasm.js',
  'node_modules/@tesseract.js-data/eng/index.js',
  'node_modules/sharp/package.json',
];

for (const runtimeFile of requiredRuntimeFiles) {
  try {
    await access(resolve(target, runtimeFile));
  } catch {
    throw new Error(`Release artifact is missing required runtime file: ${runtimeFile}`);
  }
}

const imageRuntimeDirectories = new Set(
  await readdir(resolve(target, 'node_modules/@img'), { withFileTypes: true }).then((entries) =>
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  ),
);
const sharpPlatform = `sharp-${process.platform}-${process.arch}`;
if (!imageRuntimeDirectories.has(sharpPlatform)) {
  throw new Error(`Release artifact is missing the Sharp runtime package: @img/${sharpPlatform}`);
}
if (process.platform !== 'win32') {
  const sharpLibvipsPlatform = `sharp-libvips-${process.platform}-${process.arch}`;
  if (!imageRuntimeDirectories.has(sharpLibvipsPlatform)) {
    throw new Error(
      `Release artifact is missing the Sharp libvips package: @img/${sharpLibvipsPlatform}`,
    );
  }
}

console.log(`Release artifact is clean: ${files.length} files checked in ${target}`);
