/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is shared by Next and plain Node. */
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const TARGET_TIMESTAMP = 1784487600000;
const SURFACE_TAG = '0026_nutrition_surface_preferences';
const PANTRY_TAG = '0026_pantry_grocery_formula';
const SURFACE_HASH = 'c26ee2186ca93a4a329520e7cec2a634649c22f3cc1df3216334d181c334edc9';
const PANTRY_HASH = 'be15bc88948c95f4899e1fac8cb114fcb60ad7080e5dc482246cbc81adc98dae';
const ATTESTATION_TIMESTAMP = 1784491200000;
const ATTESTATION_TAG = '0027_nutrition_prepared_name_snapshot_attestation';
const ATTESTATION_HASH = '8e3a3c16631177735e2964a063a209d52efd152458d4e04899f3b174b0a9e8f3';
const INTEGRITY_TIMESTAMP = 1784494800000;
const INTEGRITY_TAG = '0028_nutrition_household_actor_integrity';
const INTEGRITY_HASH = '49bf505ff1c537db0c739500a52d3fa20a978ef26a2715de61cd6a94a4a1baa8';
const LEGACY_PREFIX_FINGERPRINT =
  '0dcb7c0bfdf62e6e2da652679e4376d91da40603f8f8cdff84a49833e7f75ade';
const SOURCE_PREFIX_FINGERPRINT =
  '7db3fa8285a8bc5bf0f00346e91b648e57e5fa54205d70ae209f3c2327b6b9ab';
const UNAFFECTED_OBJECT_FINGERPRINT =
  'b7f0858abbb6b1b654bcef541468832a66262adcd6d723cdffb99286232446b1';

const preparedDefinitions = [
  'id text primary key not null',
  'recipe_id text not null',
  'recipe_calculation_id text not null',
  'meal_plan_entry_id text',
  'cook_session_id text',
  'actual_servings real not null check (actual_servings > 0)',
  'final_weight_grams real check (final_weight_grams is null or final_weight_grams > 0)',
  "calculation_alignment text not null check (calculation_alignment in ('as_calculated','requires_recalculation'))",
  'included_optional_ingredient_ids_snapshot text not null',
  'adjustments_snapshot text not null',
  "note text default '' not null",
  'request_digest text not null',
  'created_by_principal_id text not null',
  'created_at integer not null',
  'foreign key (recipe_id) references recipes(id) on delete restrict',
  'foreign key (recipe_calculation_id) references recipe_nutrition_calculations(id) on delete restrict',
  'foreign key (meal_plan_entry_id) references meal_plan_entries(id) on delete restrict',
  'foreign key (cook_session_id) references cook_sessions(id) on delete restrict',
  'foreign key (created_by_principal_id) references nutrition_principals(id) on delete restrict',
];
const preparedNameDefinition = 'recipe_name_snapshot text not null';
const preparedActorDefinition =
  'actor_household_profile_id text references profiles(id) on delete restrict';

const surfaceColumns = [
  {
    name: 'show_recipe_card_nutrition',
    type: 'INTEGER',
    notnull: 1,
    defaultValue: '1',
    definition:
      'show_recipe_card_nutrition integer not null default 1 check (show_recipe_card_nutrition in (0,1))',
  },
  {
    name: 'recipe_card_nutrient_codes',
    type: 'TEXT',
    notnull: 1,
    defaultValue: `'["energy_kcal","protein","fiber"]'`,
    definition: `recipe_card_nutrient_codes text not null default '["energy_kcal","protein","fiber"]'`,
  },
  {
    name: 'show_meal_plan_nutrition',
    type: 'INTEGER',
    notnull: 1,
    defaultValue: '1',
    definition:
      'show_meal_plan_nutrition integer not null default 1 check (show_meal_plan_nutrition in (0,1))',
  },
];

const pantryColumns = [
  ['generation_mode', 'TEXT', `'missing'`],
  ['coverage_state', 'TEXT', `'active'`],
  ['manual_extra_quantity', 'REAL', '0'],
  ['manual_extra_unit', 'TEXT', `''`],
  ['covered_quantity', 'REAL', '0'],
  ['covered_unit', 'TEXT', `''`],
  ['purchased_quantity', 'REAL', '0'],
  ['purchased_unit', 'TEXT', `''`],
  ['control_note', 'TEXT', `''`],
].map(([name, type, defaultValue]) => ({
  name,
  type,
  notnull: 1,
  defaultValue,
  definition: `${name} ${type.toLowerCase()} default ${defaultValue} not null`,
}));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(`Duplicate-0026 migration lineage rejected: ${message}`);
}

function normalizeSql(value) {
  return value
    .replace(/[`"\[\]]/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([(),])\s*/gu, '$1')
    .trim()
    .toLowerCase();
}

function splitColumnDefinitions(createSql) {
  if (!createSql) return [];
  const start = createSql.indexOf('(');
  const end = createSql.lastIndexOf(')');
  if (start < 0 || end <= start) return [];

  const definitions = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (const character of createSql.slice(start + 1, end)) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      definitions.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) definitions.push(current.trim());
  return definitions;
}

function tableShape(sqlite, tableName, expectedColumns) {
  const table = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  const definitions = splitColumnDefinitions(table?.sql).map(normalizeSql);
  const columns = new Map(
    sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => [column.name, column]),
  );
  const present = expectedColumns.filter((expected) => columns.has(expected.name));

  if (present.length !== 0 && present.length !== expectedColumns.length) {
    fail(`${tableName} has only part of the duplicate-0026 column set`);
  }
  if (present.length === 0) return false;

  for (const expected of expectedColumns) {
    const actual = columns.get(expected.name);
    if (
      actual.type.toUpperCase() !== expected.type ||
      actual.notnull !== expected.notnull ||
      actual.dflt_value !== expected.defaultValue ||
      actual.pk !== 0
    ) {
      fail(`${tableName}.${expected.name} has an unexpected type, nullability, default, or key`);
    }
    if (!definitions.includes(normalizeSql(expected.definition))) {
      fail(`${tableName}.${expected.name} has an unexpected declaration or CHECK constraint`);
    }
  }
  return true;
}

function pantryIndexShape(sqlite) {
  const indexes = sqlite.prepare('PRAGMA index_list(pantry_shopping_item_details)').all();
  const matches = indexes.filter((index) => index.name === 'pantry_shopping_details_coverage_idx');
  if (matches.length > 1) fail('the Pantry coverage index is duplicated');
  if (matches.length === 0) return false;
  if (matches[0].unique !== 0 || matches[0].partial !== 0) {
    fail('the Pantry coverage index has unexpected uniqueness or partial semantics');
  }
  const columns = sqlite
    .prepare('PRAGMA index_info(pantry_shopping_details_coverage_idx)')
    .all()
    .map((column) => column.name);
  const index = sqlite
    .prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get('pantry_shopping_details_coverage_idx');
  if (
    index?.tbl_name !== 'pantry_shopping_item_details' ||
    columns.length !== 1 ||
    columns[0] !== 'coverage_state' ||
    normalizeSql(index.sql) !==
      normalizeSql(
        'CREATE INDEX pantry_shopping_details_coverage_idx ON pantry_shopping_item_details (coverage_state)',
      )
  ) {
    fail('the Pantry coverage index targets an unexpected table or column');
  }
  return true;
}

function orderedPairPrefix(actual, expected) {
  return (
    actual.length <= expected.length &&
    actual.every(
      ([actualHash, actualTimestamp], index) =>
        actualHash === expected[index][0] && actualTimestamp === expected[index][1],
    )
  );
}

function pristineZeroHistory(sqlite) {
  const objects = sqlite
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all();
  if (objects.length === 0) return true;
  if (
    objects.length !== 1 ||
    objects[0].type !== 'table' ||
    objects[0].name !== '__drizzle_migrations' ||
    objects[0].tbl_name !== '__drizzle_migrations' ||
    normalizeSql(objects[0].sql) !==
      normalizeSql(
        `CREATE TABLE __drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric
        )`,
      )
  ) {
    return false;
  }

  const columns = sqlite.prepare('PRAGMA table_info(__drizzle_migrations)').all();
  return (
    columns.length === 3 &&
    columns[0].name === 'id' &&
    columns[0].type.toUpperCase() === 'SERIAL' &&
    columns[0].notnull === 0 &&
    columns[0].dflt_value === null &&
    columns[0].pk === 1 &&
    columns[1].name === 'hash' &&
    columns[1].type.toUpperCase() === 'TEXT' &&
    columns[1].notnull === 1 &&
    columns[1].dflt_value === null &&
    columns[1].pk === 0 &&
    columns[2].name === 'created_at' &&
    columns[2].type.toUpperCase() === 'NUMERIC' &&
    columns[2].notnull === 0 &&
    columns[2].dflt_value === null &&
    columns[2].pk === 0
  );
}

function unaffectedObjectFingerprint(sqlite) {
  const objects = sqlite
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
         AND name NOT IN ('__drizzle_migrations', 'nutrition_prepared_recipe_instances')
       ORDER BY type, name, tbl_name`,
    )
    .all()
    .map((object) => [object.type, object.name, object.tbl_name, normalizeSql(object.sql)]);
  return {
    count: objects.length,
    fingerprint: sha256(JSON.stringify(objects)),
  };
}

function exactUnaffectedObjects(sqlite) {
  const objects = unaffectedObjectFingerprint(sqlite);
  return objects.count === 152 && objects.fingerprint === UNAFFECTED_OBJECT_FINGERPRINT;
}

function preparedTableShape(sqlite, mode) {
  const table = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nutrition_prepared_recipe_instances'",
    )
    .get();
  if (!table) return false;
  const expectedDefinitions =
    mode === 'legacy'
      ? preparedDefinitions
      : mode === 'attested'
        ? [...preparedDefinitions, preparedNameDefinition]
        : [...preparedDefinitions, preparedNameDefinition, preparedActorDefinition];
  const actualDefinitions = splitColumnDefinitions(table.sql).map(normalizeSql).sort();
  if (
    JSON.stringify(actualDefinitions) !==
    JSON.stringify(expectedDefinitions.map(normalizeSql).sort())
  ) {
    return false;
  }

  const columns = sqlite.prepare('PRAGMA table_info(nutrition_prepared_recipe_instances)').all();
  const expectedColumnCount = mode === 'legacy' ? 14 : mode === 'attested' ? 15 : 16;
  if (columns.length !== expectedColumnCount) return false;
  const nameColumn = columns.filter((column) => column.name === 'recipe_name_snapshot');
  if (
    mode === 'legacy'
      ? nameColumn.length !== 0
      : !(
          nameColumn.length === 1 &&
          nameColumn[0].type.toUpperCase() === 'TEXT' &&
          nameColumn[0].notnull === 1 &&
          nameColumn[0].dflt_value === null &&
          nameColumn[0].pk === 0
        )
  ) {
    return false;
  }
  if (mode !== 'integrity') return true;
  const actorColumn = columns.filter((column) => column.name === 'actor_household_profile_id');
  const actorForeignKeys = sqlite
    .prepare('PRAGMA foreign_key_list(nutrition_prepared_recipe_instances)')
    .all()
    .filter((foreignKey) => foreignKey.from === 'actor_household_profile_id');
  const actorIndexes = sqlite
    .prepare('PRAGMA index_list(nutrition_prepared_recipe_instances)')
    .all()
    .filter((index) => index.name === 'nutrition_prepared_actor_idx');
  const actorIndexColumns = sqlite.prepare('PRAGMA index_info(nutrition_prepared_actor_idx)').all();
  return (
    actorColumn.length === 1 &&
    actorColumn[0].type.toUpperCase() === 'TEXT' &&
    actorColumn[0].notnull === 0 &&
    actorColumn[0].dflt_value === null &&
    actorColumn[0].pk === 0 &&
    actorForeignKeys.length === 1 &&
    actorForeignKeys[0].table === 'profiles' &&
    actorForeignKeys[0].to === 'id' &&
    actorForeignKeys[0].on_delete.toUpperCase() === 'RESTRICT' &&
    actorIndexes.length === 1 &&
    actorIndexes[0].unique === 0 &&
    actorIndexes[0].partial === 0 &&
    actorIndexColumns.length === 1 &&
    actorIndexColumns[0].name === 'actor_household_profile_id'
  );
}

function preparedRowCount(sqlite) {
  return sqlite.prepare('SELECT count(*) AS count FROM nutrition_prepared_recipe_instances').get()
    .count;
}

function supportsRequiredAlterColumn(sqlite) {
  const version = sqlite.prepare('SELECT sqlite_version() AS version').get().version;
  const [major, minor] = version.split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 53);
}

function verifySource(migrationsFolder) {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const targets = journal.entries.filter((entry) => entry.when === TARGET_TIMESTAMP);
  if (
    targets.length !== 2 ||
    targets[0].idx !== 26 ||
    targets[0].tag !== SURFACE_TAG ||
    targets[0].version !== '1' ||
    targets[0].breakpoints !== true ||
    targets[1].idx !== 26 ||
    targets[1].tag !== PANTRY_TAG ||
    targets[1].version !== '1' ||
    targets[1].breakpoints !== true
  ) {
    fail('the immutable duplicate-0026 journal entries changed');
  }

  const migrationHash = (tag) => sha256(readFileSync(join(migrationsFolder, `${tag}.sql`)));
  if (migrationHash(SURFACE_TAG) !== SURFACE_HASH || migrationHash(PANTRY_TAG) !== PANTRY_HASH) {
    fail('an immutable duplicate-0026 SQL hash changed');
  }

  const sourcePrefix = journal.entries
    .filter((entry) => entry.when < TARGET_TIMESTAMP)
    .map((entry) => [migrationHash(entry.tag), entry.when]);
  if (sha256(JSON.stringify(sourcePrefix)) !== SOURCE_PREFIX_FINGERPRINT) {
    fail('the current pre-0026 source lineage changed');
  }

  const pantryTargetIndex = journal.entries.findIndex(
    (entry) => entry.when === TARGET_TIMESTAMP && entry.tag === PANTRY_TAG,
  );
  const attestation = journal.entries[pantryTargetIndex + 1];
  if (
    pantryTargetIndex < 0 ||
    attestation?.idx !== 27 ||
    attestation?.version !== '1' ||
    attestation?.when !== ATTESTATION_TIMESTAMP ||
    attestation?.tag !== ATTESTATION_TAG ||
    attestation?.breakpoints !== true ||
    journal.entries.filter((entry) => entry.tag === ATTESTATION_TAG).length !== 1 ||
    migrationHash(ATTESTATION_TAG) !== ATTESTATION_HASH
  ) {
    fail('the unique 0027 prepared-name attestation source changed');
  }

  const integrity = journal.entries[pantryTargetIndex + 2];
  if (
    integrity?.idx !== 28 ||
    integrity?.version !== '1' ||
    integrity?.when !== INTEGRITY_TIMESTAMP ||
    integrity?.tag !== INTEGRITY_TAG ||
    integrity?.breakpoints !== true ||
    journal.entries.filter((entry) => entry.tag === INTEGRITY_TAG).length !== 1 ||
    migrationHash(INTEGRITY_TAG) !== INTEGRITY_HASH
  ) {
    fail('the unique 0028 household-actor integrity source changed');
  }

  const later = journal.entries
    .filter((entry) => entry.when > TARGET_TIMESTAMP)
    .map((entry) => [migrationHash(entry.tag), entry.when]);

  return {
    pantrySql: readFileSync(join(migrationsFolder, `${PANTRY_TAG}.sql`), 'utf8'),
    attestationSql: readFileSync(join(migrationsFolder, `${ATTESTATION_TAG}.sql`), 'utf8'),
    sourcePrefix,
    later,
  };
}

function preTargetFingerprint(sqlite) {
  const before = migrationRows(sqlite).filter((row) => Number(row.created_at) < TARGET_TIMESTAMP);
  return sha256(JSON.stringify(before.map((row) => [row.hash, Number(row.created_at)])));
}

function attestationRows(sqlite) {
  return migrationRows(sqlite).filter(
    (row) => Number(row.created_at) === ATTESTATION_TIMESTAMP || row.hash === ATTESTATION_HASH,
  );
}

function integrityRows(sqlite) {
  return migrationRows(sqlite).filter(
    (row) => Number(row.created_at) === INTEGRITY_TIMESTAMP || row.hash === INTEGRITY_HASH,
  );
}

function migrationRows(sqlite) {
  const table = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!table) return [];
  try {
    return sqlite
      .prepare(
        'SELECT rowid, hash, created_at FROM __drizzle_migrations ORDER BY created_at, rowid',
      )
      .all();
  } catch {
    fail('the Drizzle migration table is malformed');
  }
}

function classify(sqlite, source) {
  const rows = migrationRows(sqlite);
  const before = rows.filter((row) => Number(row.created_at) < TARGET_TIMESTAMP);
  const targets = rows.filter((row) => Number(row.created_at) === TARGET_TIMESTAMP);
  const later = rows.filter((row) => Number(row.created_at) > TARGET_TIMESTAMP);
  const beforePairs = before.map((row) => [row.hash, Number(row.created_at)]);
  const laterPairs = later.map((row) => [row.hash, Number(row.created_at)]);
  const prefixFingerprint = sha256(JSON.stringify(beforePairs));
  const surfaceRows = targets.filter((row) => row.hash === SURFACE_HASH);
  const pantryRows = targets.filter((row) => row.hash === PANTRY_HASH);
  const unknownTargets = targets.filter(
    (row) => row.hash !== SURFACE_HASH && row.hash !== PANTRY_HASH,
  );
  if (
    surfaceRows.length > 1 ||
    pantryRows.length > 1 ||
    unknownTargets.length > 0 ||
    rows.some((row) => typeof row.hash !== 'string' || !Number.isFinite(Number(row.created_at)))
  ) {
    fail('the migration table has duplicate, unknown, or malformed target rows');
  }

  const hasSurfaceSchema = tableShape(sqlite, 'nutrition_profiles', surfaceColumns);
  const hasPantryColumns = tableShape(sqlite, 'pantry_shopping_item_details', pantryColumns);
  const hasPantryIndex = pantryIndexShape(sqlite);
  if (hasPantryColumns !== hasPantryIndex) {
    fail('the Pantry formula columns and coverage index are inconsistent');
  }

  const exactLegacyOrSourcePrefix =
    prefixFingerprint === LEGACY_PREFIX_FINGERPRINT ||
    prefixFingerprint === SOURCE_PREFIX_FINGERPRINT;
  const exactCurrentPrefix = orderedPairPrefix(beforePairs, source.sourcePrefix);
  const exactLaterPrefix = orderedPairPrefix(laterPairs, source.later);
  const stateA =
    exactLegacyOrSourcePrefix &&
    surfaceRows.length === 1 &&
    pantryRows.length === 0 &&
    hasSurfaceSchema &&
    !hasPantryColumns;
  const stateB =
    exactLegacyOrSourcePrefix &&
    surfaceRows.length === 1 &&
    pantryRows.length === 1 &&
    hasSurfaceSchema &&
    hasPantryColumns &&
    exactLaterPrefix;
  const stateC =
    later.length === 0 &&
    targets.length === 0 &&
    !hasSurfaceSchema &&
    !hasPantryColumns &&
    exactCurrentPrefix &&
    (rows.length > 0 || pristineZeroHistory(sqlite));

  if (stateA) {
    if (later.length > 0)
      fail('a later migration marker exists while Pantry formula state is missing');
    return 'A';
  }
  if (stateB) return 'B';
  if (stateC) return 'C';
  fail('the database is partial, hash/schema-mismatched, or has an unknown pre-0026 lineage');
}

function requireUnattestedPreparedState(sqlite) {
  if (attestationRows(sqlite).length !== 0) {
    fail('the 0027 attestation marker is already present before attestation');
  }
  if (!exactUnaffectedObjects(sqlite)) {
    fail('the database has a second schema/object difference outside the prepared table');
  }

  const lineage = preTargetFingerprint(sqlite);
  if (lineage === LEGACY_PREFIX_FINGERPRINT) {
    if (!preparedTableShape(sqlite, 'legacy')) {
      fail('the legacy prepared-instance table is not the exact observed logical shape');
    }
    if (preparedRowCount(sqlite) !== 0) {
      fail('the legacy prepared-instance table is nonempty');
    }
    if (!supportsRequiredAlterColumn(sqlite)) {
      fail('SQLite 3.53 or newer is required for the no-default prepared-name repair');
    }
    return 'legacy';
  }
  if (lineage === SOURCE_PREFIX_FINGERPRINT) {
    if (!preparedTableShape(sqlite, 'attested')) {
      fail('the fresh prepared-instance table is not the exact canonical logical shape');
    }
    return 'fresh';
  }
  fail('the unattested prepared-instance lineage is neither exact legacy nor canonical');
}

function requireAttestedPreparedState(sqlite, source, requireFullJournal) {
  const integrity = integrityRows(sqlite);
  if (integrity.length > 1) fail('the unique 0028 household-actor marker is duplicated');
  if (
    integrity.length === 0
      ? !preparedTableShape(sqlite, 'attested')
      : !preparedTableShape(sqlite, 'integrity')
  ) {
    fail('the prepared-instance table does not match its exact pre/post-0028 shape');
  }
  const laterPairs = migrationRows(sqlite)
    .filter((row) => Number(row.created_at) > TARGET_TIMESTAMP)
    .map((row) => [row.hash, Number(row.created_at)]);
  const expectedLater =
    integrity.length === 1
      ? source.later
      : source.later.slice(
          0,
          source.later.findIndex(
            ([hash, timestamp]) => hash === INTEGRITY_HASH && timestamp === INTEGRITY_TIMESTAMP,
          ),
        );
  if (
    attestationRows(sqlite).length !== 1 ||
    laterPairs.length === 0 ||
    laterPairs[0][0] !== ATTESTATION_HASH ||
    laterPairs[0][1] !== ATTESTATION_TIMESTAMP ||
    (integrity.length === 1 &&
      (integrity[0].hash !== INTEGRITY_HASH ||
        Number(integrity[0].created_at) !== INTEGRITY_TIMESTAMP)) ||
    (requireFullJournal && JSON.stringify(laterPairs) !== JSON.stringify(expectedLater))
  ) {
    fail('the unique 0027 attestation history is missing, duplicated, or incomplete');
  }
}

function attestPreparedNameSnapshot(sqlite, source, options) {
  if (attestationRows(sqlite).length > 0) {
    requireAttestedPreparedState(sqlite, source, false);
    return;
  }

  const initialMode = requireUnattestedPreparedState(sqlite);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    if (classify(sqlite, source) !== 'B') {
      fail('0026 state changed during prepared-name immediate-transaction reclassification');
    }
    const mode = requireUnattestedPreparedState(sqlite);
    if (mode !== initialMode) fail('the prepared-instance state changed during reclassification');

    if (mode === 'legacy') {
      sqlite.exec(
        'ALTER TABLE nutrition_prepared_recipe_instances ADD COLUMN recipe_name_snapshot TEXT',
      );
      sqlite.exec(
        'ALTER TABLE nutrition_prepared_recipe_instances ALTER COLUMN recipe_name_snapshot SET NOT NULL',
      );
    }
    sqlite.exec(source.attestationSql);
    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(ATTESTATION_HASH, ATTESTATION_TIMESTAMP);
    if (options.testOnlyFailAfterDdl) {
      throw new Error('Injected recovery failure after prepared-name DDL and attestation marker.');
    }
    if (classify(sqlite, source) !== 'B') {
      fail('the prepared-name transaction no longer has exact 0026 state B');
    }
    if (!exactUnaffectedObjects(sqlite)) {
      fail('the prepared-name transaction changed an unaffected schema object');
    }
    requireAttestedPreparedState(sqlite, source, false);
    if (mode === 'legacy' && preparedRowCount(sqlite) !== 0) {
      fail('the legacy prepared-instance table changed row count during repair');
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
    throw error;
  }
}

function recoverDuplicate0026Lineage(sqlite, migrationsFolder, options = {}) {
  const source = verifySource(migrationsFolder);
  const initialState = classify(sqlite, source);
  if (initialState === 'C') return initialState;

  if (initialState === 'A') {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      if (classify(sqlite, source) !== 'A')
        fail('state changed during immediate-transaction reclassification');
      sqlite.exec(source.pantrySql);
      if (options.testOnlyFailAfterDdl) throw new Error('Injected recovery failure after DDL.');
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(PANTRY_HASH, TARGET_TIMESTAMP);
      if (classify(sqlite, source) !== 'B') fail('the in-transaction postcondition is not state B');
      sqlite.exec('COMMIT');
    } catch (error) {
      if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  attestPreparedNameSnapshot(sqlite, source, options);
  return 'B';
}

function assertDuplicate0026Lineage(sqlite, migrationsFolder) {
  const source = verifySource(migrationsFolder);
  if (classify(sqlite, source) !== 'B') {
    fail('the post-migration database did not converge to state B');
  }
  requireAttestedPreparedState(sqlite, source, true);
}

module.exports = {
  assertDuplicate0026Lineage,
  recoverDuplicate0026Lineage,
};
