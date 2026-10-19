/** Tolerate punctuation, case and small spelling edits; ask before keeping a changed food identity. */
export function ingredientIdentityChanged(before: string, after: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const a = normalize(before),
    b = normalize(after);
  if (a === b) return false;
  if (!a || !b) return true;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = above;
    }
  }
  return row[b.length]! / Math.max(a.length, b.length) > 0.2;
}
