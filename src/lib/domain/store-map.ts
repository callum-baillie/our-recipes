import { z } from 'zod';
export const GROCERY_ROUTE_PREFIX = [
  'Fresh produce',
  'Bakery',
  'Frozen',
  'Meat & seafood',
  'Grocery',
  'Deli',
  'Snacks & beverages',
  'Dairy',
  'Alcohol',
];
export const WALMART_ROUTE = [
  ...GROCERY_ROUTE_PREFIX,
  'Pets',
  'Cleaning',
  'Household paper',
  'Electronics',
  'Toys',
  'Sports',
  'Auto',
  'Hardware',
  'Paint',
  'Hardware',
  'Clearance',
  'Garden',
  'Beauty',
  'Personal care',
  'Health',
  'Kitchen',
  'Laundry',
  'Bath & shower',
  'Bedding',
  'Furniture',
  'Home',
  'Office supplies',
  'Arts & crafts',
  'Party supplies',
  'Seasonal',
  'Mens',
  'Shoes',
  'Boys',
  'Girls',
  'Baby',
  'Jewelry',
  'Womens',
  'Intimates',
];
const point = { x: z.number().min(0).max(1), y: z.number().min(0).max(1) };
export const storeMapExtractionSchema = z
  .object({
    departments: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            label: z.string().min(1).max(60),
            ...point,
            evidence: z.string().max(300),
            uncertain: z.boolean(),
            matchTerms: z.array(z.string().max(80)).max(20),
          })
          .strict(),
      )
      .max(100),
    entrances: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            label: z.string().min(1).max(100),
            ...point,
            evidence: z.string().max(300),
            kind: z.enum(['grocery', 'general', 'garden', 'unknown']),
          })
          .strict(),
      )
      .max(12),
    suggestedOrder: z.array(z.string().max(60)).max(100),
    warnings: z.array(z.string().max(400)).max(12),
  })
  .strict();
export type StoreMapExtraction = z.infer<typeof storeMapExtractionSchema>;
export type StoreMapResult = {
  map: StoreMapExtraction;
  entranceId: string;
  order: string[];
  preset: 'grocery_first' | 'walmart' | 'map_order';
  evidence: string[];
  imageHash: string;
  model: string;
};
export type StoreMapDraft = StoreMapResult & {
  id: string;
  version: number;
  cached: boolean;
  corrected: boolean;
};
export const storeMapRequestSchema = z
  .object({
    imageBase64: z.string().min(20).max(8_400_000),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    preset: z.enum(['grocery_first', 'walmart', 'map_order']).default('grocery_first'),
    notes: z.string().trim().max(1000).default(''),
    allowPaidCall: z.boolean().default(false),
  })
  .strict();
export const storeMapCorrectionSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    entranceId: z.string().max(60),
    order: z.array(z.string().max(60)).min(1).max(100),
    labels: z.record(z.string().max(60), z.string().trim().min(1).max(80)),
  })
  .strict();
function category(label: string) {
  const key = label
    .toLowerCase()
    .replace(/\b(north|south|east|west|upper|lower|area|section|left|right|and)\b/g, '')
    .replace(/[^a-z]/g, '');
  const aliases: Record<string, string> = {
    snacksbev: 'snacksbeverages',
    snacksbeverage: 'snacksbeverages',
    dairyeggs: 'dairy',
    delichilled: 'deli',
    produce: 'freshproduce',
    jewlery: 'jewelry',
  };
  return aliases[key] ?? key;
}

export function orderStoreMap(
  map: StoreMapExtraction,
  preset: StoreMapResult['preset'],
  entranceId: string,
): string[] {
  const remaining = new Map(map.departments.map((d) => [d.id, d]));
  const order: string[] = [];
  for (const label of preset === 'walmart'
    ? WALMART_ROUTE
    : preset === 'grocery_first'
      ? GROCERY_ROUTE_PREFIX
      : []) {
    const match = [...remaining.values()].find((d) => category(d.label) === category(label));
    if (match) {
      order.push(match.id);
      remaining.delete(match.id);
    }
  }
  // The image-derived order reflects visible passages. Preserve it after the requested prefix.
  // If no order is legible, use proximity only as a draft, never a shortest-path claim.
  for (const id of map.suggestedOrder)
    if (remaining.has(id)) {
      order.push(id);
      remaining.delete(id);
    }
  let current = map.departments.find((d) => d.id === order.at(-1)) ??
    map.entrances.find((e) => e.id === entranceId) ?? { x: 0.5, y: 1 };
  while (remaining.size) {
    const next = [...remaining.values()].sort(
      (a, b) =>
        Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y),
    )[0]!;
    order.push(next.id);
    remaining.delete(next.id);
    current = next;
  }
  return order;
}
export function storeMapSections(result: StoreMapResult) {
  const counts = new Map<string, number>();
  const total = new Map<string, number>();
  result.map.departments.forEach((d) =>
    total.set(d.label.toLowerCase(), (total.get(d.label.toLowerCase()) ?? 0) + 1),
  );
  return result.order.flatMap((id) => {
    const d = result.map.departments.find((item) => item.id === id);
    if (!d) return [];
    const key = d.label.toLowerCase();
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return [
      {
        aisleId: '',
        name: total.get(key)! > 1 ? `${d.label.slice(0, 60)} — area ${count}` : d.label,
        matchTerms: [...new Set([d.label, ...d.matchTerms])].slice(0, 30),
      },
    ];
  });
}
