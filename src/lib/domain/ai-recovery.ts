import { z } from 'zod';

export const aiSharingCategorySchema = z.enum([
  'shareIdentity',
  'shareDietaryPreferences',
  'shareNutritionGoals',
  'shareNutritionAggregates',
  'shareProfileGoals',
  'sharePersonalMetrics',
  'shareWeight',
  'shareRawDiary',
  'shareSharedRecipes',
  'shareRecipePreferences',
  'shareMealPlans',
  'sharePantry',
  'shareShoppingLists',
  'shareKitchenEquipment',
]);
export type AiSharingCategory = z.infer<typeof aiSharingCategorySchema>;
export const sharingLabels: Record<AiSharingCategory, string> = {
  shareIdentity: 'Names and identity',
  shareDietaryPreferences: 'Dietary preferences',
  shareNutritionGoals: 'Nutrition goals',
  shareNutritionAggregates: 'Nutrition summaries',
  shareProfileGoals: 'Personal goals',
  sharePersonalMetrics: 'Personal measurements',
  shareWeight: 'Weight',
  shareRawDiary: 'Food diary',
  shareSharedRecipes: 'Saved recipes',
  shareRecipePreferences: 'Recipe preferences',
  shareMealPlans: 'Meal plans',
  sharePantry: 'Pantry',
  shareShoppingLists: 'Shopping lists',
  shareKitchenEquipment: 'Kitchen equipment',
};
export const aiRecoveryPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('sharing'),
      targetProfileId: z.string().uuid(),
      categories: z.array(aiSharingCategorySchema).min(1).max(14),
      reason: z.string().trim().min(1).max(400),
    })
    .strict(),
  z
    .object({
      kind: z.literal('limit'),
      setting: z.enum([
        'generationsPerTenMinutes',
        'maxOutputTokens',
        'requestTimeoutSeconds',
        'toolRoundLimit',
      ]),
      value: z.number().int().positive(),
      reason: z.string().trim().min(1).max(400),
    })
    .strict(),
]);
export type AiRecoveryPayload = z.infer<typeof aiRecoveryPayloadSchema>;
export type AiRecoveryCard = {
  id: string;
  threadId: string;
  kind: 'sharing' | 'limit';
  title: string;
  reason: string;
  scope: string;
  status: 'pending' | 'approved' | 'declined' | 'used' | 'expired';
  canApprove: boolean;
  canRevoke: boolean;
  canContinue: boolean;
  approvedMode: string | null;
  approvalNote: string;
  permanentNote: string;
  expiresAt: string;
};
export type AiChatProblem = {
  code: string;
  title: string;
  message: string;
  reference: string;
  details: string;
  recoveryRequests: AiRecoveryCard[];
};
