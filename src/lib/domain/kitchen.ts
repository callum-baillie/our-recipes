import { z } from 'zod';
import { equipmentTemplate } from './kitchen-catalog';

const key = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);
export const measurementSchema = z
  .object({
    value: z.number().positive().max(100000),
    unit: z.enum([
      'ml',
      'l',
      'us-qt',
      'imperial-qt',
      'cm',
      'mm',
      'in',
      'g',
      'kg',
      'slices',
      'device-cups',
    ]),
    basis: z.enum([
      'nominal-volume',
      'working-liquid',
      'dry-input',
      'cooked-output',
      'food-mass',
      'diameter',
      'depth',
      'width',
      'height',
      'length',
      'slices-per-cycle',
    ]),
    mode: key.optional(),
    deviceCupMl: z.number().positive().max(1000).optional(),
    provenance: z.enum(['user-confirmed', 'curated-type-default']).default('user-confirmed'),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.unit === 'device-cups' && !m.deviceCupMl)
      ctx.addIssue({
        code: 'custom',
        path: ['deviceCupMl'],
        message:
          'Record the device measuring cup volume; ordinary measuring cups are not interchangeable.',
      });
    const valid = ['diameter', 'depth', 'width', 'height', 'length'].includes(m.basis)
      ? ['cm', 'mm', 'in']
      : m.basis === 'food-mass'
        ? ['g', 'kg']
        : m.basis === 'slices-per-cycle'
          ? ['slices']
          : [
              'ml',
              'l',
              'us-qt',
              'imperial-qt',
              ...(m.basis === 'dry-input' ? ['device-cups'] : []),
            ];
    if (!valid.includes(m.unit))
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Choose a unit matching the stated capacity basis.',
      });
  });
export type KitchenMeasurement = z.infer<typeof measurementSchema>;
export function comparableMeasurement(m: KitchenMeasurement) {
  const factors = {
    ml: 1,
    l: 1000,
    'us-qt': 946.352946,
    'imperial-qt': 1136.5225,
    cm: 10,
    mm: 1,
    in: 25.4,
    g: 1,
    kg: 1000,
    slices: 1,
    'device-cups': 1,
  };
  const dimension = ['ml', 'l', 'us-qt', 'imperial-qt'].includes(m.unit)
    ? 'volume'
    : ['cm', 'mm', 'in'].includes(m.unit)
      ? 'length'
      : ['g', 'kg'].includes(m.unit)
        ? 'mass'
        : m.unit === 'device-cups'
          ? 'volume'
          : m.unit;
  return {
    value: m.value * (m.unit === 'device-cups' ? m.deviceCupMl! : factors[m.unit]),
    dimension,
    basis: m.basis,
    mode: m.mode ?? null,
  };
}
export const equipmentInputSchema = z
  .object({
    typeKey: key.refine(
      (v) => Boolean(equipmentTemplate(v)),
      'Choose a catalog type or custom equipment.',
    ),
    name: z.string().trim().min(1, 'Enter an equipment name.').max(120),
    make: z.string().trim().max(100).default(''),
    model: z.string().trim().max(100).default(''),
    capabilities: z.array(key).max(24).optional(),
    measurements: z.array(measurementSchema).max(16).default([]),
    availability: z.enum(['available', 'unavailable', 'archived']).default('available'),
    material: z.string().trim().max(80).default(''),
    induction: z.enum(['yes', 'no', 'unknown']).default('unknown'),
    ovenSafe: z.enum(['yes', 'no', 'unknown']).default('unknown'),
    ovenMaxC: z.number().min(0).max(600).nullable().default(null),
    lid: z.enum(['yes', 'no', 'unknown']).default('unknown'),
    parentId: z.string().uuid().nullable().default(null),
    independentZones: z.number().int().min(1).max(8).default(1),
    independentZonesConfirmed: z.boolean().default(false),
    sharedResourceKeys: z.array(key).max(8).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.independentZones > 1 && !v.independentZonesConfirmed)
      ctx.addIssue({
        code: 'custom',
        path: ['independentZonesConfirmed'],
        message: 'Confirm these zones or cavities can operate independently.',
      });
    if (v.parentId && equipmentTemplate(v.typeKey)?.resource !== 'accessory')
      ctx.addIssue({
        code: 'custom',
        path: ['parentId'],
        message: 'Only compatible attachments belong to another base.',
      });
    if (
      v.independentZones > 1 &&
      ![
        'air-fryer',
        'oven',
        'fan-oven',
        'steam-oven',
        'gas-hob',
        'electric-hob',
        'induction-hob',
        'portable-hotplate',
      ].includes(v.typeKey)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['independentZones'],
        message: 'Extra vessels or racks are separate items, not independent heating zones.',
      });
  });
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type Equipment = EquipmentInput & {
  id: string;
  revision: number;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
  actorProfileId: string;
};
export const kitchenCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add'),
      operationId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
      count: z.number().int().min(1).max(20).default(1),
      item: equipmentInputSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('update'),
      operationId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
      itemId: z.string().uuid(),
      expectedItemRevision: z.number().int().positive(),
      item: equipmentInputSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('coverage'),
      operationId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
      coverage: z.enum(['not-started', 'partial', 'confirmed']),
    })
    .strict(),
]);
export type KitchenCommand = z.infer<typeof kitchenCommandSchema>;
export type KitchenState = {
  viewerProfileId: string;
  id: string;
  householdId: string;
  name: string;
  revision: number;
  coverage: 'not-started' | 'partial' | 'confirmed';
  items: Equipment[];
  canManage: boolean;
};
export const kitchenPhaseSchema = z
  .object({
    id: key,
    recipeId: z.string().uuid(),
    recipeRevision: z.number().int().positive(),
    cookSessionId: z.string().uuid().optional(),
    cookSessionRevision: z.number().int().positive().optional(),
    targetServings: z.number().int().min(1).max(100).optional(),
    mealPlanEntryId: z.string().uuid().optional(),
    mealExpectedUpdatedAt: z.string().datetime().optional(),
    stepRefs: z.array(z.string().max(80)).min(1).max(80),
    capability: key,
    quantity: z.number().int().min(1).max(20).default(1),
    durationMinutes: z.number().int().min(1).max(10080),
    after: z.array(key).max(40).default([]),
    // End includes release/holding/transfer/cleaning; elapsed cooking alone is not occupancy.
    releaseMinutes: z.number().int().min(0).max(10080).default(0),
    amount: measurementSchema.optional(),
    temperatureC: z.number().min(0).max(600).optional(),
    mode: key.optional(),
    needsVessel: z.boolean().default(false),
    inductionRequired: z.boolean().default(false),
    accessoryIds: z.array(z.string().uuid()).max(8).default([]),
    handsOn: z.boolean().default(false),
  })
  .strict();
export type KitchenPhase = z.infer<typeof kitchenPhaseSchema>;
export const kitchenPlanRequestSchema = z
  .object({
    episodeId: z.string().uuid().optional(),
    episodeContextRevision: z.number().int().nonnegative().optional(),
    expectedRevision: z.number().int().nonnegative(),
    phases: z.array(kitchenPhaseSchema).min(1).max(40),
    strategy: z.enum(['parallel', 'sequence']).default('sequence'),
    maxHandsOn: z.number().int().min(1).max(8).default(1),
  })
  .strict();
export type ResourceAssignment = {
  phaseId: string;
  resourceIds: string[];
  start: number;
  end: number;
  temperatureC?: number;
  mode?: string;
};
export type KitchenPlan = {
  kitchenRevision: number;
  status: 'compatible' | 'conflict' | 'needs-information';
  assignments: ResourceAssignment[];
  issues: string[];
  assumptions: string[];
};
export function equipmentResources(item: Equipment): string[] {
  return Array.from({ length: item.independentZones }, (_, i) => `${item.id}:${i + 1}`);
}
