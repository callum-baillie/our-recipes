const NON_SINGULAR_WORDS = new Set([
  'asparagus',
  'couscous',
  'glass',
  'hummus',
  'molasses',
  'watercress',
]);

const IRREGULAR_PLURALS = new Map([
  ['leaves', 'leaf'],
  ['loaves', 'loaf'],
  ['potatoes', 'potato'],
  ['tomatoes', 'tomato'],
]);

function cleanShoppingItem(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function singularizeShoppingWord(value: string): string {
  const irregular = IRREGULAR_PLURALS.get(value);
  if (irregular) return irregular;
  if (NON_SINGULAR_WORDS.has(value) || value.length < 4) return value;
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes)$/u.test(value)) return value.slice(0, -2);
  if (value.endsWith('s') && !/(?:ss|us|is)$/u.test(value)) return value.slice(0, -1);
  return value;
}

/**
 * Produces a conservative shopping identity, not a display label. Only the final
 * grocery noun is singularized, so meaningful qualifiers remain distinct:
 * "flour tortillas" and "large flour tortillas" do not collapse together.
 */
export function shoppingItemIdentity(value: string): string {
  const words = cleanShoppingItem(value).split(' ').filter(Boolean);
  if (!words.length) return '';
  words[words.length - 1] = singularizeShoppingWord(words[words.length - 1]!);
  return words.join(' ');
}

export function preferredShoppingItemLabel(current: string, candidate: string): string {
  const currentLabel = current.trim();
  const candidateLabel = candidate.trim();
  const identity = shoppingItemIdentity(currentLabel);
  if (cleanShoppingItem(currentLabel) === identity) return currentLabel;
  if (cleanShoppingItem(candidateLabel) === identity) return candidateLabel;
  return currentLabel || candidateLabel;
}

export function mergeShoppingItemNotes(current: string, candidate: string): string {
  const left = current.trim();
  const right = candidate.trim();
  if (!left) return right;
  if (!right || left.toLocaleLowerCase() === right.toLocaleLowerCase()) return left;
  return `${left}; ${right}`.slice(0, 240);
}
