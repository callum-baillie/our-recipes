/** Validate with the same Intl implementation used to group and display local dates. */
export function validTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function validLocale(value: string): boolean {
  if (!value.trim()) return false;
  try {
    Intl.getCanonicalLocales(value);
    new Intl.DateTimeFormat(value);
    return true;
  } catch {
    return false;
  }
}
