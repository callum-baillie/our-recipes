export type ShoppingScanCandidate = {
  displayName: string;
  genericName?: string;
  brand?: string;
  categories?: string[];
};

export type ShoppingScanItem = {
  id: string;
  item: string;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'brand',
  'each',
  'food',
  'foods',
  'fresh',
  'of',
  'organic',
  'pack',
  'the',
  'with',
]);

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(/\s+/u)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/u.test(token)),
    ),
  ];
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(1, Math.min(left.length, right.length));
}

export function scoreShoppingScanMatch(itemName: string, candidate: ShoppingScanCandidate): number {
  const item = itemName.trim().toLocaleLowerCase();
  const names = [candidate.displayName, candidate.genericName ?? '']
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (names.some((name) => name === item)) return 1;
  if (names.some((name) => name.includes(item) || item.includes(name))) return 0.92;

  const itemTokens = tokens(item);
  const nameScore = Math.max(...names.map((name) => tokenSimilarity(itemTokens, tokens(name))), 0);
  const categoryScore = tokenSimilarity(itemTokens, tokens((candidate.categories ?? []).join(' ')));
  const brandPenalty =
    candidate.brand && itemTokens.length > 1
      ? Math.max(0, tokenSimilarity(itemTokens, tokens(candidate.brand)) - 0.4)
      : 0;

  return Math.max(0, Math.min(0.89, nameScore * 0.82 + categoryScore * 0.18 - brandPenalty * 0.12));
}

export function rankShoppingScanMatches(
  items: ShoppingScanItem[],
  candidate: ShoppingScanCandidate,
): Array<ShoppingScanItem & { score: number }> {
  return items
    .map((item) => ({ ...item, score: scoreShoppingScanMatch(item.item, candidate) }))
    .filter((item) => item.score >= 0.28)
    .sort((left, right) => right.score - left.score || left.item.localeCompare(right.item))
    .slice(0, 5);
}
