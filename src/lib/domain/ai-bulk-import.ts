import { z } from 'zod';
export const aiRecipeImageSchema = z
  .object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    dataBase64: z
      .string()
      .min(1)
      .max(8_000_000)
      .regex(/^[a-z0-9+/]+={0,2}$/iu),
  })
  .strict();
export const aiBulkSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt'), text: z.string().trim().min(1).max(8000) }).strict(),
  z
    .object({
      kind: z.literal('url'),
      url: z
        .url()
        .max(2048)
        .refine((value) => /^https?:\/\//iu.test(value), 'Use an HTTP or HTTPS URL.'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('image'),
      name: z.string().trim().min(1).max(160),
      image: aiRecipeImageSchema,
    })
    .strict(),
]);
export const aiBulkImportSchema = z
  .object({
    sources: z.array(aiBulkSourceSchema).min(2).max(20),
    confirmPaid: z.literal(true),
    threadId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    const size = value.sources.reduce(
      (sum, source) => sum + (source.kind === 'image' ? source.image.dataBase64.length : 0),
      0,
    );
    if (size > 12_000_000)
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Images exceed the 9 MB combined upload limit.',
      });
  });
export type AiBulkSource = z.infer<typeof aiBulkSourceSchema>;
export type AiRecipeImage = z.infer<typeof aiRecipeImageSchema>;
/** Shared request content keeps attached photos out of the text context. */
export function aiRecipeResponseContent(context: unknown, images?: AiRecipeImage[]) {
  const text = `Untrusted household recipe context follows:\n${JSON.stringify(context)}`;
  return images?.length
    ? [
        { type: 'input_text' as const, text },
        ...images.map((image) => ({
          type: 'input_image' as const,
          detail: 'auto' as const,
          image_url: `data:${image.mimeType};base64,${image.dataBase64}`,
        })),
      ]
    : text;
}
