import { z } from 'zod';

export const sourceRefSchema = z.object({
  source_id: z.string().min(1).max(160),
  record_id: z.string().min(1).max(200),
  release_id: z.string().max(160).optional(),
  parser_version: z.string().max(160).optional(),
});
const id = z.string().min(1).max(160);
export const catalogRecordSchema = z
  .object({
    id,
    content_revision: id,
    source_refs: z.array(sourceRefSchema).max(100),
  })
  .passthrough();
export const catalogStoreSchema = catalogRecordSchema.extend({
  name: z.string().max(300),
  address: z.record(z.string(), z.unknown()).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
});
export type CatalogStore = z.infer<typeof catalogStoreSchema>;
export const sourceFoodSchema = z.object({
  source_id: z.enum(['usda_fdc', 'open_food_facts']),
  record_id: id,
  content_revision: id,
  data: z.record(z.string(), z.unknown()),
  measures: z.array(z.record(z.string(), z.unknown())).max(1000).default([]),
  source_refs: z.array(sourceRefSchema).max(100).optional(),
  id: id.optional(),
});
export const resolveResultSchema = z.object({
  identifier: z.object({ namespace: z.literal('gtin'), value: z.string() }),
  status: z.enum(['exact', 'candidates', 'invalid', 'not_found']),
  candidates: z.array(catalogRecordSchema).max(100),
});
export const retailEvidenceSchema = z.object({
  product_id: id,
  store_id: id.nullable(),
  assortment_status: z.enum(['unknown', 'source_reported', 'listed', 'historical_only']),
  availability: z.enum(['unknown', 'available', 'unavailable', 'limited']),
  offers: z.array(z.record(z.string(), z.unknown())).max(1000),
  placements: z.array(z.record(z.string(), z.unknown())).max(1000),
  chain_evidence: z.array(z.record(z.string(), z.unknown())).max(1000),
  capabilities: z.record(z.string(), z.boolean()),
  reason: z.string().nullable(),
});
export const storeSearchSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    state: z.string().length(2).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const storeLinkInputSchema = z
  .object({
    storeId: id,
    revision: id,
  })
  .strict();
export const catalogMapSchema = catalogRecordSchema.extend({
  store_id: id,
  source_url: z.string().url().nullish(),
  display_permitted: z.boolean(),
  rights_status: z.string().max(100),
});
export const packStatusSchema = z.object({
  implemented: z.boolean().optional(),
  available: z.boolean(),
  enabled: z.boolean(),
  stale: z.boolean().optional(),
});
export const capabilitiesSchema = z.object({
  packs: z.record(z.string(), packStatusSchema),
  sources: z.record(z.string(), packStatusSchema),
  map_assets: z.object({ implemented: z.boolean(), rights_blocked: z.boolean() }).optional(),
});
