/** Physical count drafts remain separate from confirmed stock and its optimistic version. */
export type CountBaseline = { quantity: number | null; unit: string; version: number };
export type CountDraft = { quantity: string; unit: string; version: number };
export function inventoryCountState(baseline: CountBaseline, draft?: CountDraft) {
  const raw = draft?.quantity ?? String(baseline.quantity ?? '');
  const unit = (draft?.unit ?? baseline.unit).trim();
  const quantity = raw.trim() === '' ? null : Number(raw);
  const valid =
    quantity !== null &&
    Number.isFinite(quantity) &&
    quantity >= 0 &&
    quantity <= 1_000_000 &&
    !!unit;
  const dirty =
    !!draft &&
    (quantity !== baseline.quantity || !Number.isFinite(quantity) || unit !== baseline.unit.trim());
  return { raw, unit, quantity, valid, dirty };
}
export function restoreInventoryCounts(
  value: string,
  ids: Set<string>,
): Record<string, CountDraft> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid count draft');
  const result: Record<string, CountDraft> = {};
  for (const [id, entry] of Object.entries(parsed).slice(0, 5000)) {
    if (!ids.has(id) || !entry || typeof entry !== 'object') continue;
    const item = entry as Partial<CountDraft>;
    if (
      typeof item.quantity === 'string' &&
      item.quantity.length <= 40 &&
      typeof item.unit === 'string' &&
      item.unit.length <= 30 &&
      Number.isSafeInteger(item.version) &&
      item.version! > 0
    )
      result[id] = item as CountDraft;
  }
  return result;
}
