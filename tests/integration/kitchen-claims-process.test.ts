import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { user, profileAuthLinks, kitchenResourceClaims } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  executeKitchenCommand,
  readKitchenInventory,
} from '@/lib/services/kitchen-inventory-service';
import { createRecipe } from '@/lib/services/recipe-service';
import { recipeInputSchema } from '@/lib/domain/recipe';
import type { RequestPrincipal } from '@/lib/services/auth-service';

it('K11 two independent application processes cannot claim the same exclusive bundle', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bord-kitchen-claims-'));
  const database = join(directory, 'kitchen.db');
  vi.stubEnv('DATABASE_URL', database);
  vi.stubEnv('DATA_DIR', directory);
  resetDatabaseForTests();
  const children: ReturnType<typeof spawn>[] = [];
  try {
    const profile = completeSetup({
      householdName: 'Kitchen',
      appName: 'Bord',
      profile: {
        displayName: 'Alex',
        color: '#637A45',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    }).profiles[0]!;
    const id = randomUUID(),
      now = new Date();
    getDatabase()
      .insert(user)
      .values({
        id,
        name: 'Alex',
        email: `${id}@example.test`,
        role: 'parent',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    getDatabase()
      .insert(profileAuthLinks)
      .values({ profileId: profile.id, userId: id, createdAt: now, updatedAt: now })
      .run();
    const principal: RequestPrincipal = {
      kind: 'session',
      userId: id,
      linkedProfileId: profile.id,
      profileId: profile.id,
      role: 'parent',
      accountRole: 'parent',
      activeProfileRole: 'parent',
      sessionId: 'fixture',
      apiKeyId: null,
    };
    executeKitchenCommand(principal, {
      kind: 'add',
      operationId: randomUUID(),
      expectedRevision: 0,
      item: { typeKey: 'pressure-air-multicooker', name: 'One cooker' },
    });
    const recipe = createRecipe(
      recipeInputSchema.parse({
        title: 'Stock',
        summary: '',
        servings: '2',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ item: 'Water', quantity: 1, unit: 'l', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Pressure cook stock.'] }],
      }),
      profile.id,
    );
    const plan = {
      expectedRevision: readKitchenInventory(principal).revision,
      phases: [
        {
          id: 'stock',
          recipeId: recipe.id,
          recipeRevision: recipe.currentRevision,
          stepRefs: [recipe.instructionSections[0]!.steps[0]!.id],
          capability: 'pressure-cook',
          durationMinutes: 20,
        },
      ],
    };
    const payloads = [0, 1].map(() =>
      JSON.stringify({
        principal,
        command: { operation: 'start', episodeId: randomUUID(), phaseId: 'stock', plan },
      }),
    );
    let ready = 0;
    const results = payloads.map(
      () =>
        new Promise<{ accepted: boolean; message?: string }>((resolveResult, reject) => {
          const child = spawn(
            process.execPath,
            [
              '--conditions=react-server',
              '--import',
              'tsx',
              resolve('tests/fixtures/kitchen-claim-worker.ts'),
            ],
            {
              cwd: process.cwd(),
              env: {
                ...process.env,
                DATABASE_URL: database,
                DATA_DIR: directory,
                OPENAI_API_KEY: '',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            },
          );
          children.push(child);
          let output = '',
            errors = '',
            announced = false;
          child.stdout!.on('data', (chunk) => {
            output += String(chunk);
            if (!announced && output.includes('ready\n')) {
              announced = true;
              ready++;
              if (ready === 2)
                children.forEach((worker, index) => worker.stdin!.end(payloads[index]));
            }
          });
          child.stderr!.on('data', (chunk) => (errors += String(chunk)));
          child.on('error', reject);
          child.on('exit', (code) => {
            if (code !== 0) return reject(new Error(errors || `Worker exited ${code}`));
            try {
              resolveResult(JSON.parse(output.trim().split('\n').at(-1)!));
            } catch (error) {
              reject(error);
            }
          });
        }),
    );
    const outcomes = await Promise.all(results);
    expect(outcomes.filter((result) => result.accepted)).toHaveLength(1);
    expect(outcomes.find((result) => !result.accepted)?.message).toMatch(/in use/);
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(1);
  } finally {
    children.forEach((child) => {
      if (child.exitCode === null) child.kill();
    });
    resetDatabaseForTests();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);

it('K11 upgrade preserves legacy physical occupancy as exclusive unknown allocation', () => {
  const legacy = new Database(':memory:');
  try {
    legacy.pragma('foreign_keys = ON');
    legacy.exec(
      "CREATE TABLE kitchens(id text PRIMARY KEY); INSERT INTO kitchens VALUES ('kitchen'); CREATE TABLE kitchen_resource_claims(resource_id text PRIMARY KEY NOT NULL,kitchen_id text NOT NULL REFERENCES kitchens(id),episode_id text NOT NULL,phase_id text NOT NULL,user_id text NOT NULL,started_at integer NOT NULL); INSERT INTO kitchen_resource_claims VALUES ('oven:1','kitchen','episode','dish','actor',123);",
    );
    legacy.exec(readFileSync(resolve('drizzle/0079_kitchen_cavity_claims.sql'), 'utf8'));
    expect(legacy.prepare('SELECT * FROM kitchen_resource_claims').all()).toEqual([
      {
        resource_id: 'oven:1',
        kitchen_id: 'kitchen',
        episode_id: 'episode',
        phase_id: 'dish',
        user_id: 'actor',
        started_at: 123,
        allocation: null,
      },
    ]);
    legacy.exec(
      "INSERT INTO kitchen_resource_claims(resource_id,kitchen_id,episode_id,phase_id,user_id,started_at) VALUES ('vessel:1','kitchen','episode','dish','actor',123)",
    );
    legacy.exec(readFileSync(resolve('drizzle/0080_kitchen_physical_uses.sql'), 'utf8'));
    const claims = legacy.prepare('SELECT use_id FROM kitchen_resource_claims').all() as {
      use_id: string;
    }[];
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim.use_id)).size).toBe(1);
    expect(claims[0]!.use_id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(
      legacy.prepare('SELECT user_id,released_at,allocation FROM kitchen_physical_uses').all(),
    ).toEqual([{ user_id: 'actor', released_at: null, allocation: null }]);
    expect(legacy.pragma('foreign_key_check')).toEqual([]);
  } finally {
    legacy.close();
  }
});
