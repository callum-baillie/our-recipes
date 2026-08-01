import { shoppingItemIdentity } from '@/lib/domain/shopping-item-identity';

export type PantryMatchProduct = {
  id: string;
  displayName: string;
  aliases: string[];
};

export type PantryMatchCandidate = {
  productId: string;
  displayName: string;
  score: number;
  certain: boolean;
  matchedName: string;
};

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function tokenDice(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const characterScore = 1 - editDistance(left, right) / Math.max(left.length, right.length);
  return Math.max(characterScore, tokenDice(left, right) * 0.9);
}

export function rankPantryMatches(
  itemName: string,
  products: PantryMatchProduct[],
): PantryMatchCandidate[] {
  const itemIdentity = shoppingItemIdentity(itemName);
  if (!itemIdentity) return [];
  const ranked = products
    .map((product) => {
      const names = [product.displayName, ...product.aliases];
      const match = names
        .map((name) => ({
          name,
          score: similarity(itemIdentity, shoppingItemIdentity(name)),
        }))
        .sort((left, right) => right.score - left.score)[0]!;
      return {
        productId: product.id,
        displayName: product.displayName,
        score: Number(match.score.toFixed(4)),
        certain: false,
        matchedName: match.name,
      };
    })
    .filter((candidate) => candidate.score >= 0.48)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }),
    )
    .slice(0, 3);
  if (!ranked.length) return [];
  const best = ranked[0]!;
  const runnerUp = ranked[1];
  best.certain =
    (best.score === 1 && (!runnerUp || runnerUp.score < 1)) ||
    (itemIdentity.length >= 5 &&
      best.score >= 0.92 &&
      (!runnerUp || best.score - runnerUp.score >= 0.12));
  return ranked;
}
