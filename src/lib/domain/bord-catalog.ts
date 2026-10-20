import { z } from 'zod';
import { catalogReferenceSchema } from './food-data';

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
  history_truncated: z.boolean().default(false),
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
    query: z.string().trim().min(2).max(200).optional(),
    chainId: id.optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.1).max(100).default(10),
    state: z.string().length(2).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .refine((input) => (input.latitude === undefined) === (input.longitude === undefined), {
    message: 'Supply both latitude and longitude.',
    path: ['latitude'],
  })
  .refine(
    (input) => Boolean(input.query || input.state || input.chainId || input.latitude !== undefined),
    { message: 'Choose a name, area, chain or location.', path: ['query'] },
  );
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

/** A measure belongs to one reviewed source revision; it is not a generic density. */
export const catalogMeasuresInputSchema = z
  .object({
    reference: catalogReferenceSchema,
    form: z.string().trim().min(1).max(80).optional(),
    basis: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export const storageGuidanceInputSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    form: z.string().trim().min(1).max(80).optional(),
    storageState: z.string().trim().min(1).max(80).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const catalogEnrichmentInputSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            lineId: id,
            productId: id,
            storeId: id.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine((input) => new Set(input.lines.map((line) => line.lineId)).size === input.lines.length, {
    message: 'Each line needs a unique identity.',
    path: ['lines'],
  });
export const catalogEnrichmentSchema = z
  .array(
    z.object({
      line_id: id,
      product: catalogRecordSchema.nullable(),
      retail_evidence: retailEvidenceSchema.nullable(),
    }),
  )
  .max(100);
export const catalogGuidanceSchema = catalogRecordSchema.extend({
  name: z.string().max(500),
  form: z.string().max(80).nullish(),
  storage_state: z.string().max(80).nullish(),
  storage_guidance: z.record(
    z.string().max(160),
    z.union([z.string().max(3000), z.number().finite(), z.boolean(), z.null()]),
  ),
  attribution: z.string().max(1000).default(''),
  license: z.string().max(500).default(''),
  precise_expiry: z.boolean().default(false),
});
export type CatalogMeasure = {
  label: string;
  amount: number | null;
  unit: string | null;
  gramWeight: number | null;
  form: string | null;
  basis: string | null;
};

export const catalogChainSchema = catalogRecordSchema.extend({
  name: z.string().max(300),
  country: z.string().max(2).optional(),
  observed_store_count: z.number().int().nonnegative().optional(),
});
export const catalogChainsInputSchema = z
  .object({
    country: z.string().length(2).default('US'),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
