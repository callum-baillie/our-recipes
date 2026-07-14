import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const image = process.env.DOCKER_IMAGE ?? 'our-recipes:smoke';
const container = `our-recipes-smoke-${Date.now()}`;
const hostPort = Number(process.env.DOCKER_SMOKE_PORT ?? '3910');
const dataDirectory = await mkdtemp(join(tmpdir(), 'our-recipes-docker-smoke-'));
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
    `APP_ORIGIN=${baseUrl}`,
    '-e',
    'DATA_DIR=/data',
    '-e',
    'DATABASE_URL=/data/our-recipes.db',
    image,
  );
  await waitForHealth();
}

try {
  await docker('build', '-t', image, '.');
  await runContainer();
  const setup = await fetch(`${baseUrl}/api/v1/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({
      householdName: 'Docker smoke household',
      appName: 'Our Recipes',
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
  await rm(dataDirectory, { recursive: true, force: true });
}
