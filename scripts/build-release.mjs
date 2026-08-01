import { spawnSync } from 'node:child_process';

const build = spawnSync('pnpm', ['build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
  // Builds may evaluate server modules, but they must never open a populated
  // household database or require deploy-time credentials. The standalone
  // server reads the real values when it starts.
  env: {
    ...process.env,
    CI: process.env.CI ?? '1',
    DATA_DIR: '.test-data/build-release',
    DATABASE_URL: ':memory:',
    COOKIE_SECRET: 'build-only-cookie-secret-000000000000',
    BETTER_AUTH_SECRET: 'build-only-auth-secret-00000000000000',
    BETTER_AUTH_URL: 'http://127.0.0.1:3000',
    APP_ORIGIN: 'http://127.0.0.1:3000',
    TRUSTED_ORIGINS: '',
    AUTH_SMTP_HOST: 'build.invalid',
    AUTH_SMTP_USER: 'build',
    AUTH_SMTP_PASSWORD: 'build',
  },
});

process.stdout.write(build.stdout ?? '');
process.stderr.write(build.stderr ?? '');
if (build.status !== 0) process.exit(build.status ?? 1);

const tracingWarning = /whole project was traced unintentionally/iu;
if (tracingWarning.test(`${build.stdout ?? ''}\n${build.stderr ?? ''}`)) {
  console.error('Release build rejected: Next.js traced the whole project unexpectedly.');
  process.exit(1);
}

const hydrate = spawnSync('node', ['scripts/hydrate-standalone-dependencies.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
process.stdout.write(hydrate.stdout ?? '');
process.stderr.write(hydrate.stderr ?? '');
if (hydrate.status !== 0) process.exit(hydrate.status ?? 1);

const artifact = spawnSync('pnpm', ['artifact:verify'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
process.stdout.write(artifact.stdout ?? '');
process.stderr.write(artifact.stderr ?? '');
process.exit(artifact.status ?? 1);
