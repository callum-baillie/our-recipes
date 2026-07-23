import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertDuplicate0026Lineage,
  recoverDuplicate0026Lineage,
} from '../../scripts/migration-lineage-recovery.cjs';
import { ensureDatabase, resetDatabaseForTests } from '../../src/lib/db/client';

const migrationsFolder = resolve(process.cwd(), 'drizzle');
const targetTimestamp = 1784487600000;
const attestationTimestamp = 1784491200000;
const surfaceHash = 'c26ee2186ca93a4a329520e7cec2a634649c22f3cc1df3216334d181c334edc9';
const pantryHash = 'be15bc88948c95f4899e1fac8cb114fcb60ad7080e5dc482246cbc81adc98dae';
const attestationHash = '8e3a3c16631177735e2964a063a209d52efd152458d4e04899f3b174b0a9e8f3';
const integrityTimestamp = 1784494800000;
const integrityHash = '49bf505ff1c537db0c739500a52d3fa20a978ef26a2715de61cd6a94a4a1baa8';
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'our-recipes-lineage-'));
  temporaryRoots.push(root);
  return root;
}

function migrateCurrentPrefix(databasePath: string, entryCount?: number): void {
  const root = temporaryRoot();
  const prefixFolder = join(root, 'drizzle');
  cpSync(migrationsFolder, prefixFolder, { recursive: true });
  const journalPath = join(prefixFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ when: number }>;
  };
  journal.entries = journal.entries
    .filter((entry) => entry.when < targetTimestamp)
    .slice(0, entryCount);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  const sqlite = new Database(databasePath);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: prefixFolder });
  } finally {
    sqlite.close();
  }
}

function createMigrationTable(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
}

function sourcePrefixPairs(): Array<[string, number]> {
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string; when: number }> };
  return journal.entries
    .filter((entry) => entry.when < targetTimestamp)
    .map((entry) => [
      createHash('sha256')
        .update(readFileSync(join(migrationsFolder, `${entry.tag}.sql`)))
        .digest('hex'),
      entry.when,
    ]);
}

function futureMigrationsFolder(): {
  folder: string;
  pairs: Array<[string, number]>;
} {
  const folder = join(temporaryRoot(), 'future-drizzle');
  cpSync(migrationsFolder, folder, { recursive: true });
  const currentJournal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; when: number }> };
  const latest = currentJournal.entries.at(-1)!;
  const additions = [
    {
      idx: latest.idx + 1,
      version: '1',
      when: latest.when + 3_600_000,
      tag: `${String(latest.idx + 1).padStart(4, '0')}_lineage_test_one`,
      breakpoints: true,
      sql: 'CREATE TABLE `lineage_test_one` (`id` text PRIMARY KEY);\n',
    },
    {
      idx: latest.idx + 2,
      version: '1',
      when: latest.when + 7_200_000,
      tag: `${String(latest.idx + 2).padStart(4, '0')}_lineage_test_two`,
      breakpoints: true,
      sql: 'CREATE TABLE `lineage_test_two` (`id` text PRIMARY KEY);\n',
    },
  ];
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<Record<string, unknown>>;
  };
  for (const addition of additions) {
    writeFileSync(join(folder, `${addition.tag}.sql`), addition.sql);
    journal.entries.push({
      idx: addition.idx,
      version: addition.version,
      when: addition.when,
      tag: addition.tag,
      breakpoints: addition.breakpoints,
    });
  }
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return {
    folder,
    pairs: additions.map((addition) => [
      createHash('sha256').update(addition.sql).digest('hex'),
      addition.when,
    ]),
  };
}

function createStateA(databasePath: string): void {
  migrateCurrentPrefix(databasePath);
  const sqlite = new Database(databasePath);
  try {
    sqlite.exec(
      readFileSync(join(migrationsFolder, '0026_nutrition_surface_preferences.sql'), 'utf8'),
    );
    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(surfaceHash, targetTimestamp);
  } finally {
    sqlite.close();
  }
}

function createCurrentDatabase(databasePath: string): void {
  const sqlite = new Database(databasePath);
  try {
    migrate(drizzle(sqlite), { migrationsFolder });
  } finally {
    sqlite.close();
  }
}

function replacePreparedTableDefinition(sqlite: Database.Database, from: string, to: string): void {
  const definition = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nutrition_prepared_recipe_instances'",
    )
    .get() as { sql: string };
  sqlite.pragma('foreign_keys = OFF');
  sqlite.pragma('legacy_alter_table = ON');
  sqlite.exec('DROP INDEX nutrition_prepared_actor_idx');
  sqlite.exec(
    'ALTER TABLE nutrition_prepared_recipe_instances RENAME TO old_nutrition_prepared_recipe_instances',
  );
  sqlite.exec(definition.sql.replace(from, to));
  sqlite.exec('DROP TABLE old_nutrition_prepared_recipe_instances');
  sqlite.exec(
    'CREATE INDEX nutrition_prepared_actor_idx ON nutrition_prepared_recipe_instances (actor_household_profile_id)',
  );
}

async function copyDatabase(source: string): Promise<string> {
  const target = join(temporaryRoot(), 'copy.sqlite');
  await copyDatabaseTo(source, target);
  return target;
}

async function copyDatabaseTo(source: string, target: string): Promise<void> {
  const sqlite = new Database(source, { readonly: true });
  try {
    await sqlite.backup(target);
  } finally {
    sqlite.close();
  }
}

function targetRows(sqlite: Database.Database): Array<{ hash: string }> {
  return sqlite
    .prepare('SELECT hash FROM __drizzle_migrations WHERE created_at = ? ORDER BY rowid')
    .all(targetTimestamp) as Array<{ hash: string }>;
}

function attestationHistory(sqlite: Database.Database): Array<{
  hash: string;
  created_at: number;
}> {
  return sqlite
    .prepare(
      'SELECT hash, created_at FROM __drizzle_migrations WHERE created_at = ? OR hash = ? ORDER BY rowid',
    )
    .all(attestationTimestamp, attestationHash) as Array<{
    hash: string;
    created_at: number;
  }>;
}

function preparedNameColumn(sqlite: Database.Database): Record<string, unknown> | undefined {
  return sqlite
    .prepare('PRAGMA table_info(nutrition_prepared_recipe_instances)')
    .all()
    .find((column) => (column as { name: string }).name === 'recipe_name_snapshot') as
    Record<string, unknown> | undefined;
}

function databaseContentSnapshot(sqlite: Database.Database): string {
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return JSON.stringify(
    tables.map(({ name }) => ({
      name,
      rows: sqlite.prepare(`SELECT * FROM \`${name}\``).all(),
    })),
  );
}

function schemaSnapshot(sqlite: Database.Database): string {
  return JSON.stringify(
    sqlite
      .prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'
         ORDER BY type, name, tbl_name`,
      )
      .all(),
  );
}

afterEach(() => {
  resetDatabaseForTests();
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('duplicate-0026 migration lineage recovery', () => {
  it('pins the unique LF-only 0027 attestation and 0028 integrity source boundary', () => {
    const sql = readFileSync(
      join(migrationsFolder, '0027_nutrition_prepared_name_snapshot_attestation.sql'),
    );
    expect(sql.toString()).toBe(
      'SELECT `recipe_name_snapshot` FROM `nutrition_prepared_recipe_instances` LIMIT 0;\n',
    );
    expect(createHash('sha256').update(sql).digest('hex')).toBe(attestationHash);
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<Record<string, unknown>> };
    expect(
      journal.entries.find(
        (entry) => entry.tag === '0027_nutrition_prepared_name_snapshot_attestation',
      ),
    ).toEqual({
      idx: 27,
      version: '1',
      when: attestationTimestamp,
      tag: '0027_nutrition_prepared_name_snapshot_attestation',
      breakpoints: true,
    });
    expect(
      journal.entries.filter(
        (entry) => entry.tag === '0027_nutrition_prepared_name_snapshot_attestation',
      ),
    ).toHaveLength(1);
    const integritySql = readFileSync(
      join(migrationsFolder, '0028_nutrition_household_actor_integrity.sql'),
    );
    expect(integritySql.includes(13)).toBe(false);
    expect(createHash('sha256').update(integritySql).digest('hex')).toBe(integrityHash);
    expect(
      journal.entries.find((entry) => entry.tag === '0028_nutrition_household_actor_integrity'),
    ).toEqual({
      idx: 28,
      version: '1',
      when: integrityTimestamp,
      tag: '0028_nutrition_household_actor_integrity',
      breakpoints: true,
    });
  });

  it.each([
    [
      'actor column type',
      (sqlite: Database.Database) =>
        replacePreparedTableDefinition(
          sqlite,
          '`actor_household_profile_id` text',
          '`actor_household_profile_id` blob',
        ),
    ],
    [
      'actor foreign key action',
      (sqlite: Database.Database) =>
        replacePreparedTableDefinition(
          sqlite,
          '`actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict',
          '`actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE cascade',
        ),
    ],
  ])('rejects the exact 0028 marker with a mismatched prepared %s', (_name, mutate) => {
    const databasePath = join(temporaryRoot(), 'integrity-shape-mismatch.sqlite');
    createCurrentDatabase(databasePath);
    const sqlite = new Database(databasePath);
    try {
      mutate(sqlite);
      expect(() => assertDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'Duplicate-0026 migration lineage rejected:',
      );
    } finally {
      sqlite.close();
    }
  });

  it('rejects the exact 0028 marker with a unique prepared actor index', () => {
    const databasePath = join(temporaryRoot(), 'integrity-index-mismatch.sqlite');
    createCurrentDatabase(databasePath);
    const sqlite = new Database(databasePath);
    try {
      sqlite.exec('DROP INDEX nutrition_prepared_actor_idx');
      sqlite.exec(
        'CREATE UNIQUE INDEX nutrition_prepared_actor_idx ON nutrition_prepared_recipe_instances (actor_household_profile_id)',
      );
      expect(() => assertDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'Duplicate-0026 migration lineage rejected:',
      );
    } finally {
      sqlite.close();
    }
  });

  it.each([
    [
      'wrong hash',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('UPDATE __drizzle_migrations SET hash = ? WHERE created_at = ?')
          .run('wrong-integrity-hash', integrityTimestamp),
    ],
    [
      'wrong order',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('UPDATE __drizzle_migrations SET created_at = ? WHERE created_at = ?')
          .run(attestationTimestamp - 1, integrityTimestamp),
    ],
    [
      'unknown suffix',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run('unknown-integrity-suffix', integrityTimestamp + 1),
    ],
  ])('rejects an otherwise current database with an integrity %s', (_name, mutate) => {
    const databasePath = join(temporaryRoot(), 'integrity-marker-mismatch.sqlite');
    createCurrentDatabase(databasePath);
    const sqlite = new Database(databasePath);
    try {
      mutate(sqlite);
      expect(() => assertDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'Duplicate-0026 migration lineage rejected:',
      );
    } finally {
      sqlite.close();
    }
  });

  it('atomically recovers generated state A and is idempotent in state B', () => {
    const databasePath = join(temporaryRoot(), 'state-a.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
      expect(targetRows(sqlite)).toEqual([{ hash: surfaceHash }, { hash: pantryHash }]);
      expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
      expect(targetRows(sqlite)).toEqual([{ hash: surfaceHash }, { hash: pantryHash }]);
      assertDuplicate0026Lineage(sqlite, migrationsFolder);
    } finally {
      sqlite.close();
    }
  });

  it('defers empty and exact current-prefix state C to Drizzle and requires state B afterward', () => {
    for (const withPrefix of [false, true]) {
      const databasePath = join(temporaryRoot(), `state-c-${withPrefix}.sqlite`);
      if (withPrefix) migrateCurrentPrefix(databasePath);
      const sqlite = new Database(databasePath);
      try {
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('C');
        migrate(drizzle(sqlite), { migrationsFolder });
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
        expect(targetRows(sqlite)).toEqual([{ hash: surfaceHash }, { hash: pantryHash }]);
      } finally {
        sqlite.close();
      }
    }
  });

  it('accepts every exact ordered current pre-0026 journal prefix', () => {
    const pairs = sourcePrefixPairs();
    for (let prefixLength = 0; prefixLength <= pairs.length; prefixLength += 1) {
      const databasePath = join(temporaryRoot(), `prefix-${prefixLength}.sqlite`);
      const sqlite = new Database(databasePath);
      try {
        if (prefixLength > 0) {
          createMigrationTable(sqlite);
          const insert = sqlite.prepare(
            'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
          );
          for (const pair of pairs.slice(0, prefixLength)) insert.run(...pair);
        }
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('C');
      } finally {
        sqlite.close();
      }
    }
  });

  it('accepts zero history only for a pristine database or exact empty Drizzle table', () => {
    for (const exactEmptyTable of [false, true]) {
      const sqlite = new Database(join(temporaryRoot(), `pristine-${exactEmptyTable}.sqlite`));
      try {
        if (exactEmptyTable) createMigrationTable(sqlite);
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('C');
      } finally {
        sqlite.close();
      }
    }

    for (const malformedSql of [
      'CREATE TABLE unrelated (id text)',
      'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, created_at numeric)',
      `CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        unexpected text
      )`,
    ]) {
      const sqlite = new Database(join(temporaryRoot(), 'non-pristine.sqlite'));
      try {
        sqlite.exec(malformedSql);
        expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
          'Duplicate-0026 migration lineage rejected:',
        );
      } finally {
        sqlite.close();
      }
    }
  });

  it('rolls back both Pantry DDL and its marker after an injected mid-transaction failure', () => {
    const databasePath = join(temporaryRoot(), 'rollback.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      expect(() =>
        recoverDuplicate0026Lineage(sqlite, migrationsFolder, {
          testOnlyFailAfterDdl: true,
        }),
      ).toThrow('Injected recovery failure after DDL.');
      expect(
        sqlite
          .prepare('PRAGMA table_info(pantry_shopping_item_details)')
          .all()
          .some((column) => (column as { name: string }).name === 'generation_mode'),
      ).toBe(false);
      expect(targetRows(sqlite)).toEqual([{ hash: surfaceHash }]);
      expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
    } finally {
      sqlite.close();
    }
  });

  it('preserves non-default Pantry values across repeated state B checks', () => {
    const databasePath = join(temporaryRoot(), 'values.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      recoverDuplicate0026Lineage(sqlite, migrationsFolder);
      sqlite.pragma('foreign_keys = OFF');
      sqlite
        .prepare(
          `INSERT INTO pantry_shopping_item_details (
            shopping_list_item_id, demand_state, generated_unit, formula_inputs, provenance,
            generation_key, generated_at, updated_at, generation_mode, coverage_state,
            manual_extra_quantity, manual_extra_unit, covered_quantity, covered_unit,
            purchased_quantity, purchased_unit, control_note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'value-proof',
          'manual',
          '',
          '{}',
          'manual',
          'proof',
          1,
          1,
          'total',
          'covered',
          2.5,
          'kg',
          1.25,
          'kg',
          3.75,
          'kg',
          'keep me',
        );
      const before = sqlite
        .prepare(
          "SELECT * FROM pantry_shopping_item_details WHERE shopping_list_item_id = 'value-proof'",
        )
        .get();
      expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
      expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
      expect(
        sqlite
          .prepare(
            "SELECT * FROM pantry_shopping_item_details WHERE shopping_list_item_id = 'value-proof'",
          )
          .get(),
      ).toEqual(before);
    } finally {
      sqlite.close();
    }
  });

  it('accepts only an exact ordered prefix of current post-target journal rows in state B', () => {
    const { folder, pairs } = futureMigrationsFolder();
    const validPath = join(temporaryRoot(), 'valid-later.sqlite');
    createStateA(validPath);
    const valid = new Database(validPath);
    try {
      recoverDuplicate0026Lineage(valid, migrationsFolder);
      expect(recoverDuplicate0026Lineage(valid, folder)).toBe('B');
      migrate(drizzle(valid), { migrationsFolder: folder });
      assertDuplicate0026Lineage(valid, folder);
    } finally {
      valid.close();
    }

    const invalidLaterRows: Array<Array<[string, number]>> = [
      [['arbitrary', pairs[0][1]]],
      [[pairs[1][0], pairs[1][1]]],
      [
        [pairs[1][0], pairs[0][1]],
        [pairs[0][0], pairs[1][1]],
      ],
      [pairs[0], pairs[0]],
    ];
    for (const [index, invalidRows] of invalidLaterRows.entries()) {
      const databasePath = join(temporaryRoot(), `invalid-later-${index}.sqlite`);
      createStateA(databasePath);
      const sqlite = new Database(databasePath);
      try {
        recoverDuplicate0026Lineage(sqlite, migrationsFolder);
        const insert = sqlite.prepare(
          'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        );
        for (const pair of invalidRows) insert.run(...pair);
        expect(() => recoverDuplicate0026Lineage(sqlite, folder)).toThrow(
          'Duplicate-0026 migration lineage rejected:',
        );
      } finally {
        sqlite.close();
      }
    }
  });

  it.each([
    [
      'partial column state',
      (sqlite: Database.Database) =>
        sqlite.exec(
          "ALTER TABLE pantry_shopping_item_details ADD generation_mode text DEFAULT 'missing' NOT NULL",
        ),
    ],
    [
      'duplicate target hash',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run(surfaceHash, targetTimestamp),
    ],
    [
      'unknown target hash',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run('unknown', targetTimestamp),
    ],
    [
      'tampered older prefix',
      (sqlite: Database.Database) =>
        sqlite
          .prepare(
            'UPDATE __drizzle_migrations SET hash = ? WHERE rowid = (SELECT MIN(rowid) FROM __drizzle_migrations)',
          )
          .run('tampered'),
    ],
    [
      'later marker while incomplete',
      (sqlite: Database.Database) =>
        sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run('later', targetTimestamp + 1),
    ],
  ])('fails closed for %s before completing state A', (_name, mutate) => {
    const databasePath = join(temporaryRoot(), 'rejected.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      mutate(sqlite);
      expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'Duplicate-0026 migration lineage rejected:',
      );
      expect(targetRows(sqlite).some((row) => row.hash === pantryHash)).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  it('rejects an exact target hash paired with a mismatched index declaration', () => {
    const databasePath = join(temporaryRoot(), 'index-mismatch.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      recoverDuplicate0026Lineage(sqlite, migrationsFolder);
      sqlite.exec('DROP INDEX pantry_shopping_details_coverage_idx');
      sqlite.exec(
        'CREATE UNIQUE INDEX pantry_shopping_details_coverage_idx ON pantry_shopping_item_details (coverage_state)',
      );
      expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'unexpected uniqueness',
      );
    } finally {
      sqlite.close();
    }
  });

  it.each([
    [
      'type',
      "`generation_mode` text DEFAULT 'missing' NOT NULL",
      "`generation_mode` blob DEFAULT 'missing' NOT NULL",
    ],
    [
      'default',
      "`generation_mode` text DEFAULT 'missing' NOT NULL",
      "`generation_mode` text DEFAULT 'all' NOT NULL",
    ],
  ])('rejects an exact target hash paired with a mismatched column %s', (_name, from, to) => {
    const databasePath = join(temporaryRoot(), 'column-mismatch.sqlite');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    try {
      recoverDuplicate0026Lineage(sqlite, migrationsFolder);
      const definitions = [
        "`generation_mode` text DEFAULT 'missing' NOT NULL",
        "`coverage_state` text DEFAULT 'active' NOT NULL",
        '`manual_extra_quantity` real DEFAULT 0 NOT NULL',
        "`manual_extra_unit` text DEFAULT '' NOT NULL",
        '`covered_quantity` real DEFAULT 0 NOT NULL',
        "`covered_unit` text DEFAULT '' NOT NULL",
        '`purchased_quantity` real DEFAULT 0 NOT NULL',
        "`purchased_unit` text DEFAULT '' NOT NULL",
        "`control_note` text DEFAULT '' NOT NULL",
      ].map((definition) => (definition === from ? to : definition));
      sqlite.exec('DROP INDEX pantry_shopping_details_coverage_idx');
      sqlite.exec('ALTER TABLE pantry_shopping_item_details RENAME TO old_pantry_details');
      sqlite.exec(`CREATE TABLE pantry_shopping_item_details (${definitions.join(', ')})`);
      sqlite.exec(
        'CREATE INDEX pantry_shopping_details_coverage_idx ON pantry_shopping_item_details (coverage_state)',
      );
      sqlite.exec('DROP TABLE old_pantry_details');
      expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
        'unexpected type, nullability, default, or key',
      );
    } finally {
      sqlite.close();
    }
  });

  it('runs the ordinary ensureDatabase entry point through state C', () => {
    const oldDatabaseUrl = process.env.DATABASE_URL;
    const databasePath = join(temporaryRoot(), 'client.sqlite');
    process.env.DATABASE_URL = databasePath;
    try {
      resetDatabaseForTests();
      ensureDatabase();
      resetDatabaseForTests();
      const sqlite = new Database(databasePath, { readonly: true });
      try {
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    } finally {
      if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldDatabaseUrl;
    }
  });

  it('runs the locked container entry point with backup retention and lock cleanup', () => {
    const dataDirectory = temporaryRoot();
    const databasePath = join(dataDirectory, 'our-recipes.db');
    createStateA(databasePath);
    const result = spawnSync(process.execPath, ['scripts/container-migrate.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: dataDirectory,
        DATABASE_URL: databasePath,
      },
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(existsSync(join(dataDirectory, '.migration.lock'))).toBe(false);
    expect(readdirSync(join(dataDirectory, 'backups'))).toHaveLength(1);
    const sqlite = new Database(databasePath, { readonly: true });
    try {
      assertDuplicate0026Lineage(sqlite, migrationsFolder);
    } finally {
      sqlite.close();
    }
  });

  it('retains the container backup and clears the lock when recovery fails closed', () => {
    const dataDirectory = temporaryRoot();
    const databasePath = join(dataDirectory, 'our-recipes.db');
    createStateA(databasePath);
    const sqlite = new Database(databasePath);
    sqlite.exec(
      "ALTER TABLE pantry_shopping_item_details ADD generation_mode text DEFAULT 'missing' NOT NULL",
    );
    sqlite.close();

    const result = spawnSync(process.execPath, ['scripts/container-migrate.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: dataDirectory,
        DATABASE_URL: databasePath,
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Duplicate-0026 migration lineage rejected:');
    expect(existsSync(join(dataDirectory, '.migration.lock'))).toBe(false);
    expect(readdirSync(join(dataDirectory, 'backups'))).toHaveLength(1);
    const after = new Database(databasePath, { readonly: true });
    try {
      expect(targetRows(after)).toEqual([{ hash: surfaceHash }]);
    } finally {
      after.close();
    }
  });

  const surfaceDatabase = process.env.T136_SURFACE_DB;
  it.skipIf(!surfaceDatabase || !existsSync(surfaceDatabase))(
    'recovers a disposable copy of the observed legacy surface-only database',
    async () => {
      const sqlite = new Database(await copyDatabase(surfaceDatabase!));
      try {
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    },
  );

  const bothDatabase = process.env.T136_BOTH_DB;
  it.skipIf(!bothDatabase || !existsSync(bothDatabase))(
    'attests a disposable fresh both-applied copy marker-only, then becomes a no-op',
    async () => {
      const sqlite = new Database(await copyDatabase(bothDatabase!));
      try {
        const contentBefore = databaseContentSnapshot(sqlite);
        const schemaBefore = schemaSnapshot(sqlite);
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
        expect(databaseContentSnapshot(sqlite)).toBe(contentBefore);
        expect(schemaSnapshot(sqlite)).toBe(schemaBefore);
        expect(attestationHistory(sqlite)).toEqual([
          { hash: attestationHash, created_at: attestationTimestamp },
        ]);
        const changesBeforeRepeat = sqlite.prepare('SELECT total_changes() AS count').get() as {
          count: number;
        };
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
        expect(sqlite.prepare('SELECT total_changes() AS count').get()).toEqual(
          changesBeforeRepeat,
        );
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    },
  );

  const incidentDatabase = process.env.T140_INCIDENT_DB;
  it.skipIf(!incidentDatabase || !existsSync(incidentDatabase))(
    'repairs and attests only a disposable exact empty legacy incident copy',
    async () => {
      const sqlite = new Database(await copyDatabase(incidentDatabase!));
      try {
        expect(preparedNameColumn(sqlite)).toBeUndefined();
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('B');
        expect(preparedNameColumn(sqlite)).toMatchObject({
          name: 'recipe_name_snapshot',
          type: 'TEXT',
          notnull: 1,
          dflt_value: null,
          pk: 0,
        });
        expect(attestationHistory(sqlite)).toEqual([
          { hash: attestationHash, created_at: attestationTimestamp },
        ]);
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    },
  );

  it.skipIf(!incidentDatabase || !existsSync(incidentDatabase))(
    'rejects a nonempty legacy copy before DDL or attestation',
    async () => {
      const sqlite = new Database(await copyDatabase(incidentDatabase!));
      try {
        const recipe = sqlite
          .prepare('SELECT id, current_revision AS revision FROM recipes LIMIT 1')
          .get() as { id: string; revision: number };
        const principal = sqlite.prepare('SELECT id FROM nutrition_principals LIMIT 1').get() as {
          id: string;
        };
        sqlite
          .prepare(
            `INSERT INTO recipe_nutrition_calculations (
              id, recipe_id, recipe_revision, revision, calculation_version_id,
              source_id, source_digest, confidence, completeness, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            'nonempty-calculation',
            recipe.id,
            recipe.revision,
            1,
            'legacy_recipe_fields_v1',
            'legacy_recipe_fields',
            'nonempty-digest',
            1,
            1,
            1,
          );
        sqlite
          .prepare(
            `INSERT INTO nutrition_prepared_recipe_instances (
              id, recipe_id, recipe_calculation_id, actual_servings,
              calculation_alignment, included_optional_ingredient_ids_snapshot,
              adjustments_snapshot, request_digest, created_by_principal_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            'nonempty-proof',
            recipe.id,
            'nonempty-calculation',
            1,
            'as_calculated',
            '[]',
            '{}',
            'digest',
            principal.id,
            1,
          );
        expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
          'legacy prepared-instance table is nonempty',
        );
        expect(preparedNameColumn(sqlite)).toBeUndefined();
        expect(attestationHistory(sqlite)).toEqual([]);
      } finally {
        sqlite.close();
      }
    },
  );

  it.skipIf(!incidentDatabase || !existsSync(incidentDatabase))(
    'rejects a second schema difference before legacy repair',
    async () => {
      const sqlite = new Database(await copyDatabase(incidentDatabase!));
      try {
        sqlite.exec('ALTER TABLE recipes ADD COLUMN t141_second_difference TEXT');
        expect(() => recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toThrow(
          'second schema/object difference',
        );
        expect(preparedNameColumn(sqlite)).toBeUndefined();
        expect(attestationHistory(sqlite)).toEqual([]);
      } finally {
        sqlite.close();
      }
    },
  );

  it.skipIf(!incidentDatabase || !existsSync(incidentDatabase))(
    'rolls back legacy DDL and the attestation marker together',
    async () => {
      const sqlite = new Database(await copyDatabase(incidentDatabase!));
      try {
        expect(() =>
          recoverDuplicate0026Lineage(sqlite, migrationsFolder, {
            testOnlyFailAfterDdl: true,
          }),
        ).toThrow('Injected recovery failure after prepared-name DDL and attestation marker.');
        expect(preparedNameColumn(sqlite)).toBeUndefined();
        expect(attestationHistory(sqlite)).toEqual([]);
      } finally {
        sqlite.close();
      }
    },
  );

  it.skipIf(!incidentDatabase || !existsSync(incidentDatabase))(
    'runs the ordinary entry point against a disposable incident copy',
    async () => {
      const databasePath = await copyDatabase(incidentDatabase!);
      const oldDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = databasePath;
      try {
        resetDatabaseForTests();
        ensureDatabase();
        resetDatabaseForTests();
        const sqlite = new Database(databasePath, { readonly: true });
        try {
          assertDuplicate0026Lineage(sqlite, migrationsFolder);
        } finally {
          sqlite.close();
        }
      } finally {
        if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = oldDatabaseUrl;
      }
    },
  );

  it.skipIf(!bothDatabase || !existsSync(bothDatabase))(
    'runs the locked container entry point against a disposable fresh copy',
    async () => {
      const dataDirectory = temporaryRoot();
      const databasePath = join(dataDirectory, 'our-recipes.db');
      await copyDatabaseTo(bothDatabase!, databasePath);
      const result = spawnSync(process.execPath, ['scripts/container-migrate.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DATA_DIR: dataDirectory,
          DATABASE_URL: databasePath,
        },
      });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(existsSync(join(dataDirectory, '.migration.lock'))).toBe(false);
      expect(readdirSync(join(dataDirectory, 'backups'))).toHaveLength(1);
      const sqlite = new Database(databasePath, { readonly: true });
      try {
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    },
  );

  const prefixDatabase = process.env.T139_PREFIX_DB;
  it.skipIf(!prefixDatabase || !existsSync(prefixDatabase))(
    'converges a disposable copy of the observed t082 through-0023 current prefix',
    async () => {
      const sqlite = new Database(await copyDatabase(prefixDatabase!));
      try {
        expect(recoverDuplicate0026Lineage(sqlite, migrationsFolder)).toBe('C');
        migrate(drizzle(sqlite), { migrationsFolder });
        assertDuplicate0026Lineage(sqlite, migrationsFolder);
      } finally {
        sqlite.close();
      }
    },
  );
});
