import { z } from 'zod';

export const exportOptionsSchema = z
  .object({
    paper: z.enum(['A4', 'Letter']).default('A4'),
    format: z.enum(['pdf', 'zip']).default('pdf'),
    includeNutrition: z.boolean().default(true),
    includeNotes: z.boolean().default(true),
  })
  .strict();

export const recipePdfExportSchema = exportOptionsSchema.extend({
  recipeIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)]),
  servings: z.number().positive().max(1000).optional(),
});

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Choose a real calendar date.');

export const mealPlanPdfExportSchema = exportOptionsSchema
  .extend({
    start: calendarDate,
    end: calendarDate,
    includeRecipes: z.boolean().default(true),
  })
  .refine(
    ({ start, end }) => {
      const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
      return days >= 0 && days < 56;
    },
    { path: ['end'], message: 'Choose a date range of 1 to 56 days.' },
  );

export type PdfExportOptions = z.infer<typeof exportOptionsSchema>;
export type RecipePdfExportInput = z.infer<typeof recipePdfExportSchema>;
export type MealPlanPdfExportInput = z.infer<typeof mealPlanPdfExportSchema>;

export function exportDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
export function exportDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (
    let day = Date.parse(`${start}T12:00:00Z`);
    day <= Date.parse(`${end}T12:00:00Z`);
    day += 86_400_000
  ) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
}
export function exportFileStem(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '')
      .slice(0, 70) || 'recipe'
  );
}
