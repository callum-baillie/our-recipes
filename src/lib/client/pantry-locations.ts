/** Where a new item most likely goes: a place called "pantry", else any dry-goods place. */
export function defaultLocation<T extends { path: string; storageType: string }>(
  locations: T[],
): T | undefined {
  return (
    locations.find((l) => /pantry/i.test(l.path) && l.storageType === 'pantry') ??
    locations.find((l) => l.storageType === 'pantry') ??
    locations[0]
  );
}
