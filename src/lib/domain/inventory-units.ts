export type InventoryUnitDimension = 'count' | 'mass' | 'volume' | 'unknown';

export type InventoryUnit = {
  key: string;
  label: string;
  dimension: InventoryUnitDimension;
  family: string;
  baseFactor: number;
  aliases: readonly string[];
};

const UNITS: readonly InventoryUnit[] = [
  {
    key: 'each',
    label: 'each',
    dimension: 'count',
    family: 'each',
    baseFactor: 1,
    aliases: ['each', 'item', 'items', 'piece', 'pieces', 'egg', 'eggs'],
  },
  {
    key: 'dozen',
    label: 'dozen',
    dimension: 'count',
    family: 'each',
    baseFactor: 12,
    aliases: ['dozen', 'dozens', 'doz'],
  },
  {
    key: 'package',
    label: 'packages',
    dimension: 'count',
    family: 'package',
    baseFactor: 1,
    aliases: ['package', 'packages', 'pack', 'packs', 'pkg'],
  },
  {
    key: 'can',
    label: 'cans',
    dimension: 'count',
    family: 'can',
    baseFactor: 1,
    aliases: ['can', 'cans', 'tin', 'tins'],
  },
  {
    key: 'bottle',
    label: 'bottles',
    dimension: 'count',
    family: 'bottle',
    baseFactor: 1,
    aliases: ['bottle', 'bottles'],
  },
  {
    key: 'carton',
    label: 'cartons',
    dimension: 'count',
    family: 'carton',
    baseFactor: 1,
    aliases: ['carton', 'cartons'],
  },
  {
    key: 'g',
    label: 'g',
    dimension: 'mass',
    family: 'mass',
    baseFactor: 1,
    aliases: ['g', 'gram', 'grams'],
  },
  {
    key: 'kg',
    label: 'kg',
    dimension: 'mass',
    family: 'mass',
    baseFactor: 1_000,
    aliases: ['kg', 'kilogram', 'kilograms'],
  },
  {
    key: 'oz',
    label: 'oz',
    dimension: 'mass',
    family: 'mass',
    baseFactor: 28.349_523_125,
    aliases: ['oz', 'ounce', 'ounces'],
  },
  {
    key: 'lb',
    label: 'lb',
    dimension: 'mass',
    family: 'mass',
    baseFactor: 453.592_37,
    aliases: ['lb', 'lbs', 'pound', 'pounds'],
  },
  {
    key: 'ml',
    label: 'ml',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 1,
    aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  },
  {
    key: 'l',
    label: 'L',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 1_000,
    aliases: ['l', 'liter', 'liters', 'litre', 'litres'],
  },
  {
    key: 'tsp',
    label: 'tsp',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 4.928_921_593_75,
    aliases: ['tsp', 'teaspoon', 'teaspoons'],
  },
  {
    key: 'tbsp',
    label: 'tbsp',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 14.786_764_781_25,
    aliases: ['tbsp', 'tbs', 'tablespoon', 'tablespoons'],
  },
  {
    key: 'cup',
    label: 'cups',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 236.588_236_5,
    aliases: ['cup', 'cups', 'c'],
  },
  {
    key: 'gallon',
    label: 'gal',
    dimension: 'volume',
    family: 'volume',
    baseFactor: 3_785.411_784,
    aliases: ['gallon', 'gallons', 'gal'],
  },
] as const;

function compactUnit(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\.$/u, '');
}

export function findInventoryUnit(value: string): InventoryUnit | null {
  const compact = compactUnit(value);
  return UNITS.find((unit) => unit.aliases.includes(compact)) ?? null;
}

export function normalizeInventoryUnit(value: string): string {
  return findInventoryUnit(value)?.key ?? compactUnit(value);
}

export function inventoryUnitDimension(value: string): InventoryUnitDimension {
  return findInventoryUnit(value)?.dimension ?? 'unknown';
}

export function areInventoryUnitsCompatible(from: string, to: string): boolean {
  const source = findInventoryUnit(from);
  const target = findInventoryUnit(to);
  if (!source || !target) return compactUnit(from) === compactUnit(to);
  return source.dimension === target.dimension && source.family === target.family;
}

export function convertInventoryQuantity(quantity: number, from: string, to: string): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Inventory quantity must be a finite non-negative number.');
  }
  const source = findInventoryUnit(from);
  const target = findInventoryUnit(to);
  if (!source || !target) {
    if (compactUnit(from) === compactUnit(to)) return quantity;
    throw new Error(`Cannot convert ${from || 'an unknown unit'} to ${to || 'an unknown unit'}.`);
  }
  if (source.dimension !== target.dimension || source.family !== target.family) {
    throw new Error(`Cannot convert ${from} to incompatible unit ${to}.`);
  }
  return Number(((quantity * source.baseFactor) / target.baseFactor).toFixed(6));
}

export function inventoryBaseQuantity(
  quantity: number,
  unit: string,
): {
  quantity: number;
  unit: string;
  dimension: InventoryUnitDimension;
  family: string;
} {
  const matched = findInventoryUnit(unit);
  if (!matched) {
    return {
      quantity,
      unit: normalizeInventoryUnit(unit),
      dimension: 'unknown',
      family: normalizeInventoryUnit(unit),
    };
  }
  const baseUnit =
    matched.dimension === 'mass' ? 'g' : matched.dimension === 'volume' ? 'ml' : 'each';
  return {
    quantity: Number((quantity * matched.baseFactor).toFixed(6)),
    unit: matched.family === 'each' ? baseUnit : matched.key,
    dimension: matched.dimension,
    family: matched.family,
  };
}

export function inventoryUnitOptions(): Array<Pick<InventoryUnit, 'key' | 'label' | 'dimension'>> {
  return UNITS.map(({ key, label, dimension }) => ({ key, label, dimension }));
}
