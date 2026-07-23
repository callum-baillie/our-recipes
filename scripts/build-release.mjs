import { spawnSync } from 'node:child_process';

const build = spawnSync('pnpm', ['build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
  env: { ...process.env, CI: process.env.CI ?? '1' },
});

process.stdout.write(build.stdout ?? '');
process.stderr.write(build.stderr ?? '');
if (build.status !== 0) process.exit(build.status ?? 1);

const tracingWarning = /whole project was traced unintentionally/iu;
if (tracingWarning.test(`${build.stdout ?? ''}\n${build.stderr ?? ''}`)) {
  console.error('Release build rejected: Next.js traced the whole project unexpectedly.');
  process.exit(1);
}

const artifact = spawnSync('pnpm', ['artifact:verify'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
process.stdout.write(artifact.stdout ?? '');
process.stderr.write(artifact.stderr ?? '');
process.exit(artifact.status ?? 1);
