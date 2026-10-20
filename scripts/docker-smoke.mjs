import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const image = process.env.DOCKER_IMAGE ?? 'bord:smoke';
const container = `bord-smoke-${Date.now()}`;
const hostPort = Number(process.env.DOCKER_SMOKE_PORT ?? '3910');
const dataDirectory = await mkdtemp(join(tmpdir(), 'bord-docker-smoke-'));
const baseUrl = `http://127.0.0.1:${hostPort}`;
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expectedVersion = process.env.DOCKER_EXPECTED_VERSION ?? version;
let cookie = '';

async function docker(...args) {
  return execFileAsync('docker', args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

async function request(path, { body, authenticated = true, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: baseUrl,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(response.status, expected, `${path} returned HTTP ${response.status}.`);
  return response;
}

async function signIn() {
  const response = await request('/api/auth/sign-in/email', {
    body: { email: 'cook@example.invalid', password: 'docker smoke passphrase' },
    authenticated: false,
  });
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie, 'Synthetic sign-in did not return a session cookie.');
}

async function createRecipe(title) {
  const response = await request('/api/v1/recipes', {
    expected: 201,
    body: {
      title,
      summary: '',
      servings: '2 bowls',
      prepMinutes: 5,
      cookMinutes: 15,
      sourceName: '',
      sourceUrl: '',
      tags: ['smoke'],
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: 1, unit: 'cup', item: 'water', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Simmer gently.'] }],
    },
  });
  return (await response.json()).recipe;
}

async function assertHealth(setupComplete) {
  const health = await (await waitForHealth()).json();
  assert.equal(health.version, expectedVersion);
  assert.equal(health.migrationStatus, 'current');
  assert.equal(health.setupComplete, setupComplete);
  return health;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(2_000),
      });
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
    `127.0.0.1:${hostPort}:3000`,
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
    'AUTH_REQUIRE_EMAIL_VERIFICATION=false',
    '-e',
    'OPEN_FOOD_FACTS_ENABLED=false',
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
  await assertHealth(false);
  await docker(
    'exec',
    container,
    'node',
    '-e',
    `const fs = require('node:fs');
     const uid = fs.readFileSync('/proc/1/status', 'utf8').match(/^Uid:\\s+(\\d+)/m)?.[1];
     if (uid !== '1001') throw new Error('Application PID 1 must run as UID 1001.');
     for (const path of ['.api_keys', '.env', '.git', '.test-data', 'data'])
       if (fs.existsSync('/app/' + path)) throw new Error('Unexpected runtime path: ' + path);`,
  );
  await request('/api/v1/setup', {
    expected: 201,
    body: {
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
    },
  });
  await request('/api/v1/backups', { authenticated: false, expected: 401 });
  await signIn();
  const retainedRecipe = await createRecipe('Container backup soup');
  const backup = await (await request('/api/v1/backups', { body: {}, expected: 201 })).json();
  assert.equal(backup.backup.manifest.applicationVersion, expectedVersion);
  const backupPath = `/api/v1/backups/${backup.backup.id}`;
  const validated = await (await request(backupPath)).json();
  assert.equal(validated.backup.id, backup.backup.id);
  const download = await request(`${backupPath}/download`);
  assert.equal(download.headers.get('content-type'), 'application/gzip');
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.ok(bytes.length > 0, 'Backup download was empty.');
  assert.equal(bytes.length, backup.backup.bytes);
  const removedRecipe = await createRecipe('Only present after the backup');
  await request(`${backupPath}/restore`, { body: { confirmation: 'RESTORE' } });
  // Restore must revoke the old session; a fresh synthetic sign-in verifies data.
  await request('/api/v1/backups', { expected: 401 });
  await signIn();
  await request(`/api/v1/recipes/${retainedRecipe.id}`);
  await request(`/api/v1/recipes/${removedRecipe.id}`, { expected: 404 });
  const history = await (await request('/api/v1/backups')).json();
  assert.ok(history.backups.length >= 2, 'Restore did not retain a safety backup.');
  await docker('stop', container);
  await runContainer();
  const health = await assertHealth(true);
  await signIn();
  await request(`/api/v1/recipes/${retainedRecipe.id}`);
  await request(`/api/v1/recipes/${removedRecipe.id}`, { expected: 404 });
  await docker(
    'exec',
    '--user',
    '1001:1001',
    container,
    'node',
    '-e',
    "require('node:fs').writeFileSync('/data/.restore-in-progress.json', '{}', { flag: 'wx' })",
  );
  const blocked = await request('/api/v1/health', { authenticated: false, expected: 503 });
  assert.equal((await blocked.json()).status, 'recovery_required');
  await docker('stop', container);
  await assert.rejects(
    docker(
      'run',
      '--rm',
      '-v',
      `${dataDirectory}:/data`,
      image,
      'node',
      'scripts/container-migrate.mjs',
    ),
    /Backup recovery is incomplete/u,
  );
  console.log(
    JSON.stringify(
      {
        image,
        version: health.version,
        schemaVersion: health.schemaVersion,
        nonRoot: true,
        runtimePathsClean: true,
        persistentRestart: true,
        backupCreatedDownloadedValidatedRestored: true,
        restoredSessionsRevoked: true,
        interruptedRecoveryBlocksRuntimeAndStartup: true,
        backupBytes: bytes.length,
        backupSha256: createHash('sha256').update(bytes).digest('hex'),
      },
      null,
      2,
    ),
  );
} catch (error) {
  const logs = await docker('logs', '--tail', '80', container).catch(() => null);
  if (logs) process.stderr.write(`${logs.stdout}\n${logs.stderr}`);
  throw error;
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
