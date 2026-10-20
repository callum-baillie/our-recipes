/** Settings arrays are atomic choices; keyed collections should be projected to records first. */
export type SettingsConflict = {
  path: string[];
  baseline: unknown;
  draft: unknown;
  current: unknown;
};
export type SettingsMerge<T> = {
  value: T;
  conflicts: SettingsConflict[];
  retained: string[][];
  refreshed: string[][];
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function mergeSettings<T>(baseline: T, draft: T, current: T): SettingsMerge<T> {
  const conflicts: SettingsConflict[] = [];
  const retained: string[][] = [];
  const refreshed: string[][] = [];
  function merge(base: unknown, local: unknown, latest: unknown, path: string[]): unknown {
    if (same(local, base) && same(latest, base)) return latest;
    if (record(local) && record(latest) && (record(base) || base == null)) {
      const original = record(base) ? base : {};
      return Object.fromEntries(
        [...new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(latest)])]
          .map((key) => [key, merge(original[key], local[key], latest[key], [...path, key])])
          .filter(([, value]) => value !== undefined),
      );
    }
    if (same(local, base)) {
      refreshed.push(path);
      return latest;
    }
    if (same(local, latest) || same(latest, base)) {
      retained.push(path);
      return local;
    }
    conflicts.push({ path, baseline: base, draft: local, current: latest });
    return latest;
  }
  return { value: merge(baseline, draft, current, []) as T, conflicts, retained, refreshed };
}
export function resolveSettingsMerge<T>(
  merge: SettingsMerge<T>,
  choices: Record<string, 'draft' | 'current'>,
): T {
  const result = structuredClone(merge.value);
  for (const conflict of merge.conflicts) {
    const choice = choices[JSON.stringify(conflict.path)];
    if (!choice) throw new Error('Choose a value for every conflicting field.');
    let target = result as Record<string, unknown>;
    for (const key of conflict.path.slice(0, -1)) target = target[key] as Record<string, unknown>;
    const value = choice === 'draft' ? conflict.draft : conflict.current;
    if (!conflict.path.length) return structuredClone(value) as T;
    if (value === undefined) delete target[conflict.path.at(-1)!];
    else target[conflict.path.at(-1)!] = structuredClone(value);
  }
  return result;
}
