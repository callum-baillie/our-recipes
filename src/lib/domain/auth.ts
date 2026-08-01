import { z } from 'zod';

export const normalizedEmailSchema = z
  .string()
  .trim()
  .pipe(z.email('Enter a valid email address.').max(254))
  .transform((value) => value.toLocaleLowerCase('en-US'));

export const passphraseSchema = z
  .string()
  .min(15, 'Use at least 15 characters for the passphrase.')
  .max(128, 'Use no more than 128 characters for the passphrase.');

const weakPins = new Set([
  '000000',
  '111111',
  '123456',
  '222222',
  '333333',
  '444444',
  '555555',
  '654321',
  '666666',
  '777777',
  '888888',
  '987654',
  '999999',
]);

export const profilePinSchema = z
  .string()
  .regex(/^\d{6}$/u, 'Use an exact six-digit PIN.')
  .refine((value) => !weakPins.has(value), 'Choose a less predictable PIN.')
  .refine((value) => !/^(\d)\1{5}$/u.test(value), 'Choose a PIN that does not repeat one digit.');

export const profileCredentialsSchema = z
  .object({
    email: normalizedEmailSchema,
    passphrase: passphraseSchema,
    pin: profilePinSchema,
  })
  .strict();

export const signInSchema = z
  .object({
    email: normalizedEmailSchema,
    passphrase: passphraseSchema,
    rememberMe: z.boolean().default(true),
    callbackUrl: z.string().startsWith('/').max(1_024).default('/'),
  })
  .strict();

export const profilePinSwitchSchema = z.object({ pin: profilePinSchema }).strict();

export const recoveryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^BORD-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u, 'Enter a valid recovery code.');

export const accountRecoverySchema = z
  .object({
    email: normalizedEmailSchema,
    recoveryCode: recoveryCodeSchema,
    newPassphrase: passphraseSchema,
  })
  .strict();

export const apiResources = [
  'recipes',
  'mealPlans',
  'shoppingLists',
  'collections',
  'pantry',
] as const;
export const apiActions = ['read', 'create', 'update', 'delete'] as const;

export type ApiResource = (typeof apiResources)[number];
export type ApiAction = (typeof apiActions)[number];
export type ApiPermissions = Partial<Record<ApiResource, ApiAction[]>>;

export const apiPermissionsSchema = z
  .object({
    recipes: z.array(z.enum(apiActions)).max(apiActions.length).optional(),
    mealPlans: z.array(z.enum(apiActions)).max(apiActions.length).optional(),
    shoppingLists: z.array(z.enum(apiActions)).max(apiActions.length).optional(),
    collections: z.array(z.enum(apiActions)).max(apiActions.length).optional(),
    pantry: z.array(z.enum(apiActions)).max(apiActions.length).optional(),
  })
  .strict()
  .transform(
    (permissions) =>
      Object.fromEntries(
        Object.entries(permissions).map(([resource, actions]) => [
          resource,
          [...new Set(actions)].toSorted(),
        ]),
      ) as ApiPermissions,
  );

export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    expiresInDays: z.number().int().min(1).max(365).default(90),
    permissions: apiPermissionsSchema.default({
      recipes: ['read'],
      mealPlans: ['read'],
      shoppingLists: ['read'],
      collections: ['read'],
      pantry: ['read'],
    }),
  })
  .strict();

export const updateApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
    permissions: apiPermissionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one key change.');

export const cursorPageSchema = z.object({
  cursor: z.string().trim().min(1).max(1_024).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});

export const bulkExportQuerySchema = z.object({
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/u, 'Use visible ASCII characters for Idempotency-Key.');

export type ProfileCredentialsInput = z.infer<typeof profileCredentialsSchema>;
