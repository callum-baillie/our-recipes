import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getSqliteDatabase, resetDatabaseForTests } from '@/lib/db/client';
import {
  addProfile,
  completeSetup,
  setProfileArchived,
  updateProfile,
} from '@/lib/services/household-service';
import { resolveNutritionHouseholdContext } from '@/lib/services/nutrition-household-profile-service';
import {
  NutritionProfileForbiddenError,
  appendNutritionGoalVersion,
  appendNutritionPermission,
  authenticateNutritionPrincipal,
  rotateNutritionAccessSecret,
} from '@/lib/services/nutrition-profile-service';

const roots: string[] = [];

function setupInput(displayName = 'Avery') {
  return {
    displayName,
    color: '#637A45',
    avatarUrl: '',
    units: 'metric' as const,
    temperatureUnit: 'C' as const,
    locale: 'en-US',
    timezone: 'UTC',
  };
}

function actorFor(profileId: string) {
  const context = resolveNutritionHouseholdContext({ profileId, source: 'profile-cookie' });
  return {
    householdProfileId: profileId,
    compatibilityPrincipalId: context.compatibilityPrincipalId,
  };
}

function pre0028Database(): Database.Database {
  const root = mkdtempSync(join(tmpdir(), 'nutrition-0028-'));
  roots.push(root);
  const folder = join(root, 'drizzle');
  cpSync(resolve(process.cwd(), 'drizzle'), folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ when: number }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.when < 1784494800000);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  const sqlite = new Database(join(root, 'database.sqlite'));
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder: folder });
  return sqlite;
}

function apply0028(sqlite: Database.Database): void {
  const statements = readFileSync(
    resolve(process.cwd(), 'drizzle/0028_nutrition_household_actor_integrity.sql'),
    'utf8',
  )
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
  sqlite.transaction(() => statements.forEach((statement) => sqlite.exec(statement)))();
}

describe('Nutrition household actor integrity', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it('physically enforces one-to-one linkage while retaining honest SET NULL metadata guards', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: setupInput(),
    });
    const sqlite = getSqliteDatabase();
    expect(
      sqlite
        .prepare("SELECT * FROM pragma_table_info('nutrition_profiles') WHERE name=?")
        .get('linked_household_profile_id'),
    ).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: null });
    expect(
      sqlite
        .prepare(
          "SELECT on_delete FROM pragma_foreign_key_list('nutrition_profiles') WHERE [from]=?",
        )
        .get('linked_household_profile_id'),
    ).toEqual({ on_delete: 'SET NULL' });
    const householdProfileId = state.profiles[0]!.id;
    const nutrition = resolveNutritionHouseholdContext({
      profileId: householdProfileId,
      source: 'profile-cookie',
    }).activeNutritionProfile;
    expect(() => sqlite.prepare('DELETE FROM profiles WHERE id=?').run(householdProfileId)).toThrow(
      'archive linked household profiles',
    );
    expect(() =>
      sqlite
        .prepare('UPDATE nutrition_profiles SET linked_household_profile_id=? WHERE id=?')
        .run(crypto.randomUUID(), nutrition.id),
    ).toThrow('household link is immutable');
  });

  it('synchronizes deterministic lifecycle IDs transactionally and restores the same history', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: setupInput(),
    });
    const firstId = state.profiles[0]!.id;
    const first = resolveNutritionHouseholdContext({
      profileId: firstId,
      source: 'profile-cookie',
    });
    expect(first.activeNutritionProfile.id).toBe(firstId);
    expect(first.compatibilityPrincipalId).toBe(firstId);
    const second = addProfile(setupInput('Riley'));
    expect(actorFor(second.id).compatibilityPrincipalId).toBe(second.id);
    updateProfile(second.id, {
      ...setupInput('Riley Updated'),
      avatarUrl: 'https://example.com/r.png',
    });
    expect(
      resolveNutritionHouseholdContext({ profileId: second.id, source: 'profile-cookie' })
        .activeNutritionProfile,
    ).toMatchObject({ id: second.id, displayName: 'Riley Updated' });
    setProfileArchived(second.id, true);
    const archived = getSqliteDatabase()
      .prepare('SELECT id, archived_at FROM nutrition_profiles WHERE id=?')
      .get(second.id) as { id: string; archived_at: number | null };
    expect(archived).toMatchObject({ id: second.id });
    expect(archived.archived_at).not.toBeNull();
    setProfileArchived(second.id, false);
    expect(actorFor(second.id).compatibilityPrincipalId).toBe(second.id);

    getSqliteDatabase().exec(`CREATE TRIGGER fail_nutrition_sync
      BEFORE UPDATE ON nutrition_profiles BEGIN SELECT RAISE(ABORT, 'injected sync failure'); END`);
    expect(() => updateProfile(second.id, setupInput('Must Roll Back'))).toThrow(
      'injected sync failure',
    );
    expect(
      getSqliteDatabase().prepare('SELECT display_name FROM profiles WHERE id=?').get(second.id),
    ).toEqual({ display_name: 'Riley Updated' });
  });

  it('persists the signed actor pair and rejects missing or forged immutable attribution', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: setupInput(),
    });
    const profileId = state.profiles[0]!.id;
    const actor = actorFor(profileId);
    const goal = appendNutritionGoalVersion(profileId, actor, {
      nutrientCode: 'protein',
      unit: 'g',
      sourceType: 'user_defined',
      startsOn: '2026-07-19',
      kind: 'minimum',
      value: 50,
    });
    expect(
      getSqliteDatabase()
        .prepare(
          'SELECT created_by_principal_id, actor_household_profile_id FROM nutrition_goal_versions WHERE id=?',
        )
        .get(goal.id),
    ).toEqual({
      created_by_principal_id: actor.compatibilityPrincipalId,
      actor_household_profile_id: profileId,
    });
    expect(() =>
      appendNutritionGoalVersion(
        profileId,
        { ...actor, householdProfileId: crypto.randomUUID() },
        {
          nutrientCode: 'fiber',
          unit: 'g',
          sourceType: 'user_defined',
          startsOn: '2026-07-19',
          kind: 'minimum',
          value: 20,
        },
      ),
    ).toThrow(NutritionProfileForbiddenError);
    expect(() =>
      getSqliteDatabase()
        .prepare(
          `INSERT INTO nutrition_goal_versions (
            id,nutrition_profile_id,series_id,revision,nutrient_code,unit,source_type,
            starts_on,state,kind,value,created_by_principal_id,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          crypto.randomUUID(),
          profileId,
          crypto.randomUUID(),
          1,
          'protein',
          'g',
          'user_defined',
          '2026-07-19',
          'active',
          'minimum',
          50,
          actor.compatibilityPrincipalId,
          Date.now(),
        ),
    ).toThrow('valid household actor is required');
  });

  it('retires credentials and permissions without deleting principals', () => {
    const state = completeSetup({
      householdName: 'Household',
      appName: 'Our Recipes',
      profile: setupInput(),
    });
    const actor = actorFor(state.profiles[0]!.id);
    expect(authenticateNutritionPrincipal(actor.compatibilityPrincipalId, 'anything')).toBeNull();
    expect(() =>
      rotateNutritionAccessSecret(actor.compatibilityPrincipalId, 'old', 'new secret', 1),
    ).toThrow(NutritionProfileForbiddenError);
    expect(() =>
      appendNutritionPermission(state.profiles[0]!.id, actor.compatibilityPrincipalId, {
        principalId: actor.compatibilityPrincipalId,
        role: 'viewer',
        canViewDiary: false,
        canViewMeasurements: false,
        canManageProfile: false,
        canManageGoals: false,
        canViewComparison: false,
        canExportData: false,
        canDeleteData: false,
        expiresAt: null,
      }),
    ).toThrow(NutritionProfileForbiddenError);
    expect(
      getSqliteDatabase().prepare('SELECT count(*) count FROM nutrition_principals').get(),
    ).toEqual({ count: 1 });
  });

  it('provisions a genuinely missing Nutrition row from the exact household ID only', () => {
    const sqlite = pre0028Database();
    try {
      sqlite.exec(`INSERT INTO profiles (
        id,display_name,color,avatar_url,units,temperature_unit,locale,timezone,
        archived_at,created_at,updated_at
      ) VALUES (
        '11111111-1111-4111-8111-111111111111','Avery','#637A45',NULL,
        'metric','C','en-US','UTC',NULL,1,1
      )`);
      apply0028(sqlite);
      expect(
        sqlite
          .prepare(
            'SELECT id,owner_principal_id,linked_household_profile_id FROM nutrition_profiles',
          )
          .all(),
      ).toEqual([
        {
          id: '11111111-1111-4111-8111-111111111111',
          owner_principal_id: '11111111-1111-4111-8111-111111111111',
          linked_household_profile_id: '11111111-1111-4111-8111-111111111111',
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  it.each([
    [
      'null link',
      (sqlite: Database.Database) =>
        sqlite.exec('UPDATE nutrition_profiles SET linked_household_profile_id=NULL'),
    ],
    [
      'archive mismatch',
      (sqlite: Database.Database) => sqlite.exec('UPDATE nutrition_profiles SET archived_at=1'),
    ],
    [
      'unassigned profile',
      (sqlite: Database.Database) =>
        sqlite.exec("UPDATE nutrition_profiles SET profile_type='unassigned'"),
    ],
    [
      'duplicate link',
      (sqlite: Database.Database) =>
        sqlite.exec(`
          INSERT INTO nutrition_principals VALUES ('44444444-4444-4444-8444-444444444444','legacy',1,NULL,NULL,1,1);
          INSERT INTO nutrition_profiles (
            id,owner_principal_id,linked_household_profile_id,display_name,profile_type,
            measurement_system,nutrition_goal_type,comparison_visibility,diary_visibility,
            preferred_energy_unit,daily_reset_timezone,week_starts_on,reference_jurisdiction,
            created_at,updated_at
          ) VALUES (
            '55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444',
            '11111111-1111-4111-8111-111111111111','Duplicate','adult','metric','none',
            'named','private','kcal','UTC',1,'US',1,1
          )`),
    ],
    [
      'orphan link',
      (sqlite: Database.Database) => {
        sqlite.pragma('foreign_keys = OFF');
        sqlite.exec("UPDATE nutrition_profiles SET linked_household_profile_id='missing'");
        sqlite.pragma('foreign_keys = ON');
      },
    ],
    [
      'missing principal',
      (sqlite: Database.Database) => {
        sqlite.pragma('foreign_keys = OFF');
        sqlite.exec("UPDATE nutrition_profiles SET owner_principal_id='missing'");
        sqlite.pragma('foreign_keys = ON');
      },
    ],
    [
      'shared owner',
      (sqlite: Database.Database) =>
        sqlite.exec(`
          INSERT INTO profiles (
            id,display_name,color,avatar_url,units,temperature_unit,locale,timezone,
            archived_at,created_at,updated_at
          ) VALUES ('66666666-6666-4666-8666-666666666666','Riley','#637A45',NULL,'metric','C','en-US','UTC',NULL,1,1);
          INSERT INTO nutrition_profiles (
            id,owner_principal_id,linked_household_profile_id,display_name,profile_type,
            measurement_system,nutrition_goal_type,comparison_visibility,diary_visibility,
            preferred_energy_unit,daily_reset_timezone,week_starts_on,reference_jurisdiction,
            created_at,updated_at
          ) VALUES (
            '77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222',
            '66666666-6666-4666-8666-666666666666','Riley','adult','metric','none',
            'named','private','kcal','UTC',1,'US',1,1
          )`),
    ],
    [
      'ambiguous historical principal actor',
      (sqlite: Database.Database) =>
        sqlite.exec(`
          INSERT INTO nutrition_principals VALUES ('88888888-8888-4888-8888-888888888888','legacy',1,NULL,NULL,1,1);
          INSERT INTO nutrition_goal_versions (
            id,nutrition_profile_id,series_id,revision,nutrient_code,unit,source_type,
            starts_on,state,kind,value,created_by_principal_id,created_at
          ) VALUES (
            '99999999-9999-4999-8999-999999999999','33333333-3333-4333-8333-333333333333',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'protein','g','user_defined',
            '2026-07-19','active','minimum',50,'88888888-8888-4888-8888-888888888888',1
          )`),
    ],
    [
      'deterministic profile collision',
      (sqlite: Database.Database) =>
        sqlite.exec(`INSERT INTO profiles (
          id,display_name,color,avatar_url,units,temperature_unit,locale,timezone,
          archived_at,created_at,updated_at
        ) VALUES ('33333333-3333-4333-8333-333333333333','Collision','#637A45',NULL,'metric','C','en-US','UTC',NULL,1,1)`),
    ],
  ])('rolls back 0028 atomically for %s', (_name, mutate) => {
    const sqlite = pre0028Database();
    try {
      sqlite.exec(`INSERT INTO profiles (
        id,display_name,color,avatar_url,units,temperature_unit,locale,timezone,
        archived_at,created_at,updated_at
      ) VALUES (
        '11111111-1111-4111-8111-111111111111','Avery','#637A45',NULL,
        'metric','C','en-US','UTC',NULL,1,1
      )`);
      sqlite.exec(`INSERT INTO nutrition_principals VALUES (
        '22222222-2222-4222-8222-222222222222','legacy-verifier',1,NULL,NULL,1,1
      )`);
      sqlite.exec(`INSERT INTO nutrition_profiles (
        id,owner_principal_id,linked_household_profile_id,display_name,profile_type,
        measurement_system,nutrition_goal_type,comparison_visibility,diary_visibility,
        preferred_energy_unit,daily_reset_timezone,week_starts_on,reference_jurisdiction,
        created_at,updated_at
      ) VALUES (
        '33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111','Avery','adult','metric','none','named',
        'private','kcal','UTC',1,'US',1,1
      )`);
      mutate(sqlite);
      const before = sqlite
        .prepare("SELECT sql FROM sqlite_master WHERE name='nutrition_profiles'")
        .get();
      expect(() => apply0028(sqlite)).toThrow();
      expect(
        sqlite.prepare("SELECT sql FROM sqlite_master WHERE name='nutrition_profiles'").get(),
      ).toEqual(before);
      expect(
        sqlite
          .prepare(
            "SELECT count(*) count FROM pragma_table_info('nutrition_goal_versions') WHERE name='actor_household_profile_id'",
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });
});
