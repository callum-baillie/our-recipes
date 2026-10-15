import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const image = process.env.DOCKER_IMAGE ?? 'bord:smoke';
const container = `bord-smoke-${Date.now()}`;
const hostPort = Number(process.env.DOCKER_SMOKE_PORT ?? '3910');
const dataDirectory = await mkdtemp(join(tmpdir(), 'bord-docker-smoke-'));
const baseUrl = `http://127.0.0.1:${hostPort}`;

async function docker(...args) {
  return execFileAsync('docker', args, { windowsHide: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return response;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Container did not become healthy within 30 seconds.');
}

async function runContainer() {
  await docker(
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-p',
    `${hostPort}:3000`,
    '-v',
    `${dataDirectory}:/data`,
    '-e',
    'COOKIE_SECRET=docker-smoke-cookie-secret-with-at-least-32-characters',
    '-e',
    'BETTER_AUTH_SECRET=docker-smoke-better-auth-secret-at-least-32-characters',
    '-e',
    `APP_ORIGIN=${baseUrl}`,
    '-e',
    `BETTER_AUTH_URL=${baseUrl}`,
    '-e',
    'AUTH_EMAIL_FROM=Bord <smoke@example.invalid>',
    '-e',
    'AUTH_SMTP_HOST=smtp.example.invalid',
    '-e',
    'AUTH_SMTP_USER=smoke',
    '-e',
    'AUTH_SMTP_PASSWORD=smoke-password',
    '-e',
    'DATA_DIR=/data',
    '-e',
    'DATABASE_URL=/data/bord.db',
    image,
  );
  await waitForHealth();
}

try {
  if (process.env.DOCKER_SKIP_BUILD !== 'true') await docker('build', '-t', image, '.');
  await runContainer();
  const setup = await fetch(`${baseUrl}/api/v1/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({
      kitchenName: 'Bòrd',
      kitchenIcon: 'table',
      credentials: {
        email: 'cook@example.invalid',
        passphrase: 'docker smoke passphrase',
      },
      profile: {
        displayName: 'Cook',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    }),
  });
  if (!setup.ok) throw new Error(`Setup failed with ${setup.status}.`);
  await docker('stop', container);
  await runContainer();
  const health = await waitForHealth();
  const body = await health.json();
  if (!body.setupComplete) throw new Error('Data did not persist across container recreation.');
  console.log('Docker build, health, and persistent-volume smoke test passed.');
} finally {
  await docker('rm', '-f', container).catch(() => undefined);
  // The entrypoint assigns the mounted volume to the container account. Restore
  // ownership of this disposable directory so the host can remove its contents.
  try {
    await rm(dataDirectory, { recursive: true, force: true });
  } catch (error) {
    if (process.platform !== 'linux' || error.code !== 'EACCES') throw error;
    await docker(
      'run',
      '--rm',
      '--user',
      '0:0',
      '--entrypoint',
      'chown',
      '-v',
      `${dataDirectory}:/data`,
      image,
      '-R',
      `${process.getuid()}:${process.getgid()}`,
      '/data',
    );
    await rm(dataDirectory, { recursive: true, force: true });
  }
}
