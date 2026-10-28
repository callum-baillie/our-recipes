import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetDatabaseForTests } from '@/lib/db/client';
import { prepareProfileEnrollment } from '@/lib/services/auth-service';
import { completeSetupWithResult } from '@/lib/services/household-service';
import { createAdminApiKey } from '@/lib/services/api-key-service';
import { handleScanner } from '@/app/api/v1/scanner/_shared';
import { GET as getScannerSession } from '@/app/api/v1/scanner/stations/[stationId]/session/route';
import { auth } from '@/lib/auth/server';
const origin = 'http://localhost:3000';
let cookie: string,
  secret: string,
  otherSecret: string,
  binding: { instanceId: string; bindingId: string };
const request = (path: string, method = 'GET', body?: unknown, key?: string, site = origin) =>
  new Request(origin + '/api/v1/scanner/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : { cookie, origin: site }),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/scanner-api');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  resetDatabaseForTests();
  const enrollment = await prepareProfileEnrollment(
    'Scanner admin',
    { email: 'scanner-api@example.test', passphrase: 'scanner synthetic password 123' },
    'admin',
  );
  const setup = completeSetupWithResult(
    {
      kitchenName: 'Scanner test',
      profile: {
        displayName: 'Admin',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'UTC',
      },
    },
    [enrollment],
  );
  const signed = await auth.api.signInEmail({
    body: { email: 'scanner-api@example.test', password: 'scanner synthetic password 123' },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  cookie = signed.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ');
  const profileId = setup.state.profiles[0]!.id,
    userId = enrollment.user.id;
  const key = await createAdminApiKey({
    userId,
    profileId,
    name: 'Station',
    expiresInDays: 1,
    permissions: { pantry: ['read'] },
  });
  secret = key.secret;
  const other = await createAdminApiKey({
    userId,
    profileId,
    name: 'Different key',
    expiresInDays: 1,
    permissions: { pantry: ['read', 'create', 'update'], recipes: ['read', 'create', 'update'] },
  });
  otherSecret = other.secret;
  const registered = await handleScanner(
    request('stations', 'POST', { id: 'kitchen', name: 'Kitchen', apiKeyId: key.apiKey.id }),
    'register',
  );
  expect(registered.status).toBe(200);
  const context = await handleScanner(
    request('context?stationId=kitchen', 'GET', undefined, secret),
    'context',
  );
  expect(context.status).toBe(200);
  binding = await context.json();
});
afterAll(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
it('requires real authentication, exact origin, station key binding and session ownership', async () => {
  expect(
    (
      await handleScanner(
        new Request(origin + '/api/v1/scanner/context?stationId=kitchen'),
        'context',
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleScanner(
        request('stations', 'POST', {}, undefined, 'https://evil.example'),
        'register',
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handleScanner(
        request('context?stationId=kitchen', 'GET', undefined, otherSecret),
        'context',
      )
    ).status,
  ).toBe(403);
  expect(
    (await handleScanner(request('stations', 'GET', undefined, secret), 'stations')).status,
  ).toBe(403);
  expect(
    (
      await handleScanner(
        request('stations/kitchen', 'GET', undefined, secret),
        'station',
        'kitchen',
      )
    ).status,
  ).toBe(403);
});
it('checks command permissions even when endpoint grants pantry read', async () => {
  const command = { type: 'recipe', recipeId: randomUUID(), expectedRevision: 1, servings: 2 };
  const body = {
    contractVersion: 2,
    operationId: randomUUID(),
    stationId: 'kitchen',
    ...binding,
    command,
  };
  // Keep only the immutable handshake fields, never its display metadata.
  const operation = {
    contractVersion: body.contractVersion,
    operationId: body.operationId,
    stationId: body.stationId,
    instanceId: binding.instanceId,
    bindingId: binding.bindingId,
    command,
  };
  const denied = await handleScanner(request('operations', 'POST', operation, secret), 'operation');
  expect(denied.status).toBe(403);
});
it('blocks new legacy operations and bounds request bytes', async () => {
  const legacy = await handleScanner(
    request(
      'operations',
      'POST',
      {
        operationId: randomUUID(),
        stationId: 'kitchen',
        command: { type: 'recipe', recipeId: randomUUID(), expectedRevision: 1, servings: 2 },
      },
      secret,
    ),
    'operation',
  );
  expect(legacy.status).toBe(409);
  expect(await legacy.json()).toMatchObject({ error: { code: 'scanner_legacy_blocked' } });
  const large = await handleScanner(
    request('lookups', 'POST', { stationId: 'kitchen', barcode: '1'.repeat(9000) }, secret),
    'lookup',
  );
  expect(large.status).toBe(413);
});
it('accepts bounded telemetry without granting stock or nutrition write access', async () => {
  const sync = {
    ...binding,
    state: {
      bootId: randomUUID(),
      revision: 0,
      mode: 'idle',
      packages: 1,
      locationId: null,
      action: null,
      expiresAt: null,
      readerConnected: true,
      queueCount: 0,
      reviewCount: 0,
    },
    events: [],
    acknowledgements: [],
  };
  const payload = {
    instanceId: sync.instanceId,
    bindingId: sync.bindingId,
    state: sync.state,
    events: [],
    acknowledgements: [],
  };
  const result = await handleScanner(
    request('stations/kitchen/sync', 'POST', payload, secret),
    'sync',
    'kitchen',
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ acknowledgedSequences: [], controls: [] });
  const control = await handleScanner(
    request(
      'stations/kitchen/controls',
      'POST',
      {
        id: randomUUID(),
        bootId: sync.state.bootId,
        stateRevision: 0,
        command: { control: 'mode', mode: 'add' },
      },
      secret,
    ),
    'control',
    'kitchen',
  );
  expect(control.status).toBe(403);
});
it('rejects malformed scan-list timestamp filters', async () => {
  for (const since of ['NaN', '-1', '1.2', '9007199254740992', '']) {
    const response = await getScannerSession(request(`stations/kitchen/session?since=${since}`), {
      params: Promise.resolve({ stationId: 'kitchen' }),
    });
    expect(response.status).toBe(400);
  }
});
