import { z } from 'zod';

const safeText = z.string().trim().min(1).max(80);

export const profileInputSchema = z.object({
  displayName: safeText,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a six-digit hex color.'),
  avatarUrl: z.union([z.literal(''), z.string().url().max(2_048)]).optional(),
  units: z.enum(['metric', 'imperial']),
  temperatureUnit: z.enum(['C', 'F']),
  locale: z.string().trim().min(2).max(35),
  timezone: z.string().trim().min(2).max(80),
});

export const profileUpdateSchema = profileInputSchema;

export const setupSchema = z.object({
  householdName: safeText,
  appName: safeText,
  profile: profileInputSchema,
});

export const householdSettingsSchema = z
  .object({
    householdName: safeText,
    appName: safeText,
  })
  .strict();

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type HouseholdSettingsInput = z.infer<typeof householdSettingsSchema>;

export const defaultProfileInput: ProfileInput = {
  displayName: '',
  color: '#A85032',
  avatarUrl: '',
  units: 'metric',
  temperatureUnit: 'C',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
};
