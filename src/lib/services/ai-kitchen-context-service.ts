import { buildAiEquipmentContext } from './ai-equipment-context-service';
import 'server-only';

import { z } from 'zod';
import { appRoleCan } from '@/lib/domain/permissions';
import { DecisionError } from '@/lib/providers/decisions-provider';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { buildAiPreferencesContext } from '@/lib/services/ai-context-service';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';
import { listSupermarketProfiles } from '@/lib/services/list-settings-service';
import { getPantryDashboard } from '@/lib/services/pantry-service';
import { getShoppingList, listShoppingLists } from '@/lib/services/planning-service';

const kitchenContextRequestSchema = z
  .object({
    resource: z.enum(['pantry', 'shopping_lists', 'supermarkets', 'preferences', 'equipment']),
    recordId: z.string().uuid().nullable(),
    query: z.string().trim().max(160),
    offset: z.number().int().min(0).max(100_000),
    limit: z.number().int().min(1).max(50),
  })
  .strict();

/** Focused reads deliberately omit unrelated linked/private objects from API payloads. */
export function readAiKitchenContext(principal: RequestPrincipal, input: unknown) {
  if (
    !appRoleCan(principal.accountRole, 'shared.read') ||
    !appRoleCan(principal.role, 'shared.read')
  ) {
    throw new DecisionError('This account cannot read kitchen data through chat.', 403);
  }
  const args = kitchenContextRequestSchema.parse(input);
  if (args.resource === 'equipment') return buildAiEquipmentContext(principal);
  const policy = getAiDataPolicy(principal.linkedProfileId);
  const shared =
    args.resource === 'pantry'
      ? policy.sharePantry
      : args.resource === 'preferences' || policy.shareShoppingLists;
  if (!shared) {
    return {
      resource: args.resource,
      status: 'withheld',
      requiredSharing: args.resource === 'pantry' ? 'sharePantry' : 'shareShoppingLists',
    };
  }
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(args.query.toLocaleLowerCase());
  function page<T>(records: T[]) {
    return {
      resource: args.resource,
      status: 'available',
      scope: 'household',
      capturedAt: new Date().toISOString(),
      total: records.length,
      offset: args.offset,
      limit: args.limit,
      nextOffset: args.offset + args.limit < records.length ? args.offset + args.limit : null,
      records: records.slice(args.offset, args.offset + args.limit),
    };
  }
  if (args.resource === 'preferences') {
    return {
      resource: args.resource,
      status: 'available',
      preferences: buildAiPreferencesContext(principal.profileId, principal),
    };
  }
  if (args.resource === 'pantry') {
    return page(
      getPantryDashboard()
        .batches.filter(
          (batch) =>
            (!args.recordId || batch.id === args.recordId) &&
            matches(
              `${batch.product.displayName} ${batch.product.brand} ${batch.product.variant} ${batch.location.path}`,
            ),
        )
        .map((batch) => ({
          id: batch.id,
          productId: batch.product.id,
          product: batch.product.displayName,
          brand: batch.product.brand,
          variant: batch.product.variant,
          quantity: batch.quantityRemaining,
          quantityLabel: batch.quantityLabel,
          unit: batch.unit,
          location: batch.location.path,
          sublocation: batch.sublocation,
          status: batch.status,
          expiry: batch.expiry,
        })),
    );
  }
  if (args.resource === 'supermarkets') {
    return page(
      listSupermarketProfiles()
        .filter(
          (store) =>
            (!args.recordId || store.id === args.recordId) &&
            matches(`${store.name} ${store.locationLabel}`),
        )
        .map(({ id, name, locationLabel, notes, sections }) => ({
          id,
          name,
          locationLabel,
          notes,
          sectionCount: sections.length,
          ...(args.recordId ? { sections } : {}),
        })),
    );
  }
  if (!args.recordId) {
    return page(
      listShoppingLists()
        .filter((list) => matches(list.name))
        .map((list) => ({
          id: list.id,
          name: list.name,
          itemCount: list.itemCount,
          supermarketProfileId: list.supermarketProfileId,
        })),
    );
  }
  const list = getShoppingList(args.recordId);
  if (!list) throw new DecisionError('That shopping list no longer exists.', 404);
  return {
    ...page(
      list.items
        .filter((item) => matches(`${item.item} ${item.note}`))
        .map((item) => ({
          id: item.id,
          item: item.item,
          quantity: item.quantity,
          unit: item.unit,
          note: item.note,
          checked: item.checked,
          shoppingState: item.shoppingState,
          aisleId: item.aisleId,
          ...(policy.shareSharedRecipes && policy.shareMealPlans
            ? { sourceRecipeIds: item.sourceRecipeIds }
            : {}),
        })),
    ),
    list: {
      id: list.id,
      name: list.name,
      notes: list.notes,
      notesVersion: list.notesVersion ?? 0,
      supermarketProfileId: list.supermarketProfileId,
      aisles: list.aisles,
    },
  };
}
