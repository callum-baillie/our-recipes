import {
  MAX_KITCHEN_MEASUREMENTS,
  KITCHEN_MEASUREMENT_UNITS,
  KITCHEN_MEASUREMENT_BASES,
  measurementUnitsFor,
} from '../../../shared/kitchen-measurements';
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
    value: z
      .number()
      .positive('Enter a positive measurement, or remove it for Not sure.')
      .max(100000),
    unit: z.enum(KITCHEN_MEASUREMENT_UNITS),
    basis: z.enum(KITCHEN_MEASUREMENT_BASES),
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
    const valid = measurementUnitsFor(m.basis);
    if (m.basis === 'slices-per-cycle' && !Number.isInteger(m.value))
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Enter a whole number of slices per cycle.',
      });
    if (!valid.includes(m.unit))
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'Choose a unit matching the stated capacity basis.',
      });
  });
export const equipmentMeasurementSchema = measurementSchema.safeExtend({
  resourceIndex: z.number().int().min(1).max(8).optional(),
});
export type EquipmentMeasurement = z.infer<typeof equipmentMeasurementSchema>;
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
    measurements: z.array(equipmentMeasurementSchema).max(MAX_KITCHEN_MEASUREMENTS).default([]),
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
    const seen = new Set<string>();
    v.measurements.forEach((measurement, index) => {
      const key = `${measurement.basis}:${measurement.mode ?? ''}:${measurement.resourceIndex ?? 'whole'}`;
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['measurements', index, 'value'],
          message:
            'Record one value per basis, mode and compartment. Edit the existing measurement to correct its units.',
        });
      seen.add(key);
      if (measurement.resourceIndex && measurement.resourceIndex > v.independentZones)
        ctx.addIssue({
          code: 'custom',
          path: ['measurements', index, 'resourceIndex'],
          message: 'Choose a compartment recorded on this physical item.',
        });
    });

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
    if (v.independentZones > 1 && !equipmentTemplate(v.typeKey)?.supportsIndependentResources)
      ctx.addIssue({
        code: 'custom',
        path: ['independentZones'],
        message: 'Extra vessels or racks are separate items, not independent heating zones.',
      });
  });
/** Local unsaved drafts retain incomplete values; only equipmentInputSchema authorizes a write. */
export const equipmentDraftSchema = z
  .object({
    ...equipmentInputSchema.shape,
    name: z.string().max(120),
    measurements: z
      .array(
        z
          .object({
            ...equipmentMeasurementSchema.shape,
            value: z.number().min(0).max(100000),
            deviceCupMl: z.number().min(0).max(1000).optional(),
            mode: z.string().max(80).optional(),
          })
          .strict(),
      )
      .max(MAX_KITCHEN_MEASUREMENTS),
  })
  .strict();
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type Equipment = EquipmentInput & {
  id: string;
  revision: number;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
  actorProfileId: string;
};
export const kitchenConstraintsSchema = z
  .object({
    preparationSpace: z.enum(['unknown', 'limited', 'standard']).default('unknown'),
    equipmentStorage: z.enum(['unknown', 'limited', 'standard']).default('unknown'),
  })
  .strict();
export type KitchenConstraints = z.infer<typeof kitchenConstraintsSchema>;
export const kitchenCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('setup'),
      operationId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
      name: z.string().trim().min(1).max(80),
      constraints: kitchenConstraintsSchema,
    })
    .strict(),

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
  viewerUserId?: string;
  canRecoverAbandoned?: boolean;
  id: string;
  householdId: string;
  name: string;
  revision: number;
  coverage: 'not-started' | 'partial' | 'confirmed';
  constraints?: KitchenConstraints;
  items: Equipment[];
  canManage: boolean;
};
/** Measured footprint including user-confirmed placement clearance; never inferred from servings. */
export const cavityLoadSchema = z
  .object({
    widthMm: z.number().int().min(1).max(10000),
    depthMm: z.number().int().min(1).max(10000),
    heightMm: z.number().int().min(1).max(10000),
  })
  .strict();
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
    cavityLoad: cavityLoadSchema.optional(),
    temperatureC: z.number().min(0).max(600).optional(),
    mode: key.optional(),
    capacityReviewRequired: z.boolean().default(false),
    needsVessel: z.boolean().default(false),
    vesselCapability: z.enum(['vessel', 'bakeware', 'pressure-vessel']).optional(),
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
  cavityLoad?: z.infer<typeof cavityLoadSchema>;
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
/** Passive cookware and attachments cannot acquire a heating/motor base through a capability flag. */
export function allocatableEquipmentCapabilities(item: Equipment) {
  const template = equipmentTemplate(item.typeKey);
  if (template?.resource === 'accessory')
    return item.capabilities.filter((capability) => template.capabilities.includes(capability));
  if (template?.resource === 'vessel')
    return item.capabilities.filter((capability) =>
      ['vessel', 'bakeware', 'pressure-vessel'].includes(capability),
    );
  return item.capabilities;
}
export function equipmentResources(item: Equipment): string[] {
  return Array.from({ length: item.independentZones }, (_, i) => `${item.id}:${i + 1}`);
}
