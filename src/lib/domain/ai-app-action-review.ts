import type { AppActionReviewMetadata } from '../../../shared/mobile-domain/app-action-review';
import { mealTypeLabel } from './meal-types';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
const name = (value: RecordValue) =>
  [
    value.displayName,
    value.title,
    value.name,
    value.item,
    value.recipeTitle,
    value.recipeNameSnapshot,
    value.sourceNameSnapshot,
    value.sourceName,
    value.label,
  ].find((item): item is string => typeof item === 'string' && item.trim().length > 0);
const limit = (value: string, length = 600) =>
  value.length > length ? `${value.slice(0, length)}… (shortened)` : value;
const fieldName = (key: string) => {
  const labels: Record<string, string> = {
    plannedFor: 'Date',
    meal: 'Meal',
    mealType: 'Meal',
    quantityRemaining: 'Stock remaining',
    quantity: 'Quantity',
    servings: 'Servings',
    effectiveStatus: 'Status',
    taste: 'Tastes',
    avoid: 'Foods to avoid',
    favorites: 'Favourites',
    expectedRevision: 'Revision',
    occurredAt: 'Event time',
    unit: 'Unit',
  };
  return (
    labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./u, (c) => c.toUpperCase())
  );
};
function valueText(value: unknown, key = ''): string {
  if (value == null) return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if ((key === 'meal' || key === 'mealType') && typeof value === 'string')
    return mealTypeLabel(value);
  if (Array.isArray(value)) return value.length ? `${value.length} items` : 'None';
  if (typeof value === 'object') return name(object(value)) ?? 'Recorded details';
  return limit(String(value));
}
function findTarget(root: RecordValue, parameters: Record<string, string>): RecordValue {
  const id =
    parameters.itemId ??
    parameters.batchId ??
    parameters.productId ??
    parameters.entryId ??
    parameters.recipeId ??
    parameters.locationId ??
    parameters.collectionId ??
    parameters.tagId ??
    parameters.revisionId ??
    parameters.preparedId ??
    parameters.profileId;
  for (const key of [
    'meal',
    'recipe',
    'batch',
    'product',
    'location',
    'collection',
    'tag',
    'profile',
    'store',
    'session',
  ]) {
    const candidate = object(root[key]);
    if (Object.keys(candidate).length) return candidate;
  }
  const list = object(root.list);
  if (parameters.itemId && Array.isArray(list.items))
    return object(list.items.find((item) => object(item).id === parameters.itemId));
  if (Object.keys(list).length) return list;
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      const found = value.find((item) => object(item).id === id);
      if (found) return object(found);
    }
  }
  return root;
}

/** `snapshot` is the authorized response whose full hash guards application. */
export function buildAppActionReview(input: {
  operationId: string;
  path: string;
  method: string;
  parameters: Record<string, string>;
  body: unknown;
  snapshot?: unknown;
  references?: Record<string, unknown>;
  dependentTarget?: boolean;
}): AppActionReviewMetadata {
  const { operationId, path, method, parameters } = input;
  const root = Array.isArray(input.snapshot) ? { records: input.snapshot } : object(input.snapshot);
  const body = object(input.body);
  // Catalog matching targets an existing list row through the validated request body.
  // Use that row for identity/context just as item routes use their path parameter.
  const itemId =
    parameters.itemId ??
    (operationId === 'matchReviewedShoppingProduct' && typeof body.itemId === 'string'
      ? body.itemId
      : undefined);
  const target = findTarget(root, itemId ? { ...parameters, itemId } : parameters);
  const refs = input.references ?? {};
  const recipe = object(object(refs.recipe).recipe);
  const product = object(object(refs.product).product);
  const kind = path.startsWith('/meal-plan')
    ? 'Meal'
    : path.startsWith('/recipes')
      ? 'Recipe'
      : path.startsWith('/shopping-lists')
        ? itemId
          ? 'Shopping item'
          : 'Shopping list'
        : path.startsWith('/pantry/batches')
          ? 'Stock batch'
          : path.startsWith('/pantry/products')
            ? 'Product'
            : path.startsWith('/account/')
              ? 'Person'
              : path.startsWith('/nutrition')
                ? 'Nutrition record'
                : 'Record';
  const profile = object(root.subject);
  const label =
    (kind === 'Person' ? name(profile) : undefined) ??
    (kind === 'Stock batch' ? name(object(target.product)) : undefined) ??
    name(target) ??
    name(recipe) ??
    name(product) ??
    name(body) ??
    (input.dependentTarget
      ? `${kind} created in an earlier step`
      : input.snapshot
        ? `Saved ${kind.toLowerCase()}`
        : `New ${kind.toLowerCase()}`);
  const href = parameters.recipeId
    ? `/recipes/${encodeURIComponent(parameters.recipeId)}`
    : parameters.listId
      ? `/lists/${encodeURIComponent(parameters.listId)}`
      : path.startsWith('/meal-plan')
        ? '/planner'
        : path.startsWith('/pantry')
          ? '/pantry'
          : path.startsWith('/account/')
            ? '/account'
            : undefined;
  const image = operationId === 'generateRecipeImage';
  const review: AppActionReviewMetadata = {
    schemaVersion: 1,
    subject: { kind, label: limit(label, 180), ...(href ? { href } : {}) },
    effect: image
      ? 'Prepare an image preview'
      : method === 'DELETE'
        ? `Remove ${kind.toLowerCase()}`
        : method === 'POST'
          ? 'Apply the reviewed action'
          : `Update ${kind.toLowerCase()}`,
    context: [],
    changes: [],
    caveats: image
      ? ['Review and accept the preview separately; existing photos stay unchanged.']
      : [],
  };
  const context = (label: string, value: unknown) => {
    if (value !== undefined) review.context.push({ label, value: valueText(value) });
  };
  if (Object.keys(object(root.list)).length && itemId) context('List', name(object(root.list)));
  if (name(profile) && kind !== 'Person') context('Person', name(profile));
  if (kind === 'Meal') {
    const people = object(refs.people);
    if (Array.isArray(people.before) && people.before.length)
      context('People', people.before.join(', '));
    if ('profileIds' in body)
      review.changes.push({
        label: 'People',
        before:
          Array.isArray(people.before) && people.before.length
            ? people.before.join(', ')
            : 'No individual selection',
        after:
          Array.isArray(people.after) && people.after.length
            ? people.after.join(', ')
            : 'No individual selection',
      });
    context('Date', target.plannedFor ?? body.plannedFor);
    context(
      'Meal',
      target.mealLabel ??
        ((target.meal ?? body.meal) ? mealTypeLabel(String(target.meal ?? body.meal)) : undefined),
    );
    context('Servings', target.servings ?? body.servings);
    context('Status', target.effectiveStatus ?? target.status);
    context('Recipe', target.recipeTitle ?? name(recipe));
    context('Recipe version', target.recipeRevision);
  }
  if (kind === 'Stock batch' || kind === 'Shopping item' || kind === 'Product') {
    context(
      kind === 'Shopping item' ? 'Amount to buy' : 'Amount',
      target.quantityLabel ??
        ('quantityRemaining' in target || 'quantity' in target
          ? `${valueText(target.quantityRemaining ?? target.quantity)}${target.unit ? ` ${target.unit}` : ''}`
          : undefined),
    );
    context('Location', object(target.location).path ?? object(target.location).name);
    context('State', target.state ?? target.status);
    if (target.checked !== undefined) context('Completed', target.checked);
  }
  if (kind === 'Shopping item') {
    const cartAmount = (quantity: unknown, unit: unknown) =>
      `${valueText(quantity)}${typeof unit === 'string' && unit.trim() ? ` ${unit.trim()}` : ' (unit not recorded)'}`;
    if (
      'cartQuantity' in target &&
      (target.cartUnit != null ||
        Number(target.cartQuantity) > 0 ||
        target.shoppingState === 'in_cart')
    )
      context('Cart amount', cartAmount(target.cartQuantity, target.cartUnit));
    if (
      typeof target.cartLabel === 'string' &&
      target.cartLabel &&
      target.cartLabel !== target.item
    )
      context('Cart item', target.cartLabel);
    if ('cartQuantity' in body || 'cartUnit' in body) {
      const nextQuantity = 'cartQuantity' in body ? body.cartQuantity : target.cartQuantity;
      const nextUnit = 'cartUnit' in body ? body.cartUnit : target.cartUnit;
      if (nextQuantity !== target.cartQuantity || nextUnit !== target.cartUnit)
        review.changes.push({
          label: 'Cart amount',
          ...('cartQuantity' in target
            ? { before: cartAmount(target.cartQuantity, target.cartUnit) }
            : {}),
          after: cartAmount(nextQuantity, nextUnit),
        });
    }
  }
  if (kind === 'Nutrition record') {
    context('Event time', target.occurredAt ?? body.occurredAt);
    context('Meal', target.mealSlot ?? body.mealSlot);
    context('State', target.state);
    context('Quantity', target.quantity);
    context('Unit', target.unit);
    context('Servings', target.servingCount ?? target.actualServings);
    context('Portion weight (g)', target.portionWeightGrams);
  }
  if (name(recipe) && kind !== 'Meal') context('Recipe', name(recipe));
  if (name(product)) context('Product', name(product));
  if (body.recipeId && name(recipe) && target.recipeId !== body.recipeId)
    review.changes.push({
      label: 'Recipe',
      ...(target.recipeTitle ? { before: String(target.recipeTitle) } : {}),
      after: name(recipe)!,
    });
  if (body.productId && name(product) && target.productId !== body.productId)
    review.changes.push({
      label: 'Product',
      ...(name(object(target.product)) ? { before: name(object(target.product)) } : {}),
      after: name(product)!,
    });
  if (Array.isArray(body.itemIds) && Array.isArray(target.items)) {
    const items = target.items.map(object);
    body.itemIds.forEach((id, position) => {
      const item = items.find((item) => item.id === id);
      review.changes.push({
        label: `Position ${position + 1}`,
        before: name(items[position] ?? {}) ?? 'No item',
        after: name(item ?? {}) ?? 'Item unavailable',
      });
    });
  }
  const sourceMeal = object(object(refs.sourceMeal).meal);
  const targetMeal = object(object(refs.targetMeal).meal);
  if (operationId === 'swapMealPlanEntries') {
    review.subject.label = limit(
      `${name(sourceMeal) ?? 'Source meal'} ↔ ${name(targetMeal) ?? 'Destination meal'}`,
      180,
    );
    const slot = (meal: RecordValue) =>
      `${meal.plannedFor} · ${meal.mealLabel ?? mealTypeLabel(String(meal.meal))} · ${meal.servings} servings`;
    review.changes.push({
      label: name(sourceMeal) ?? 'Source meal',
      before: slot(sourceMeal),
      after: slot({
        ...sourceMeal,
        plannedFor: targetMeal.plannedFor,
        meal: targetMeal.meal,
        mealLabel: targetMeal.mealLabel,
      }),
    });
    review.changes.push({
      label: name(targetMeal) ?? 'Destination meal',
      before: slot(targetMeal),
      after: slot({
        ...targetMeal,
        plannedFor: sourceMeal.plannedFor,
        meal: sourceMeal.meal,
        mealLabel: sourceMeal.mealLabel,
      }),
    });
  }
  if (refs.destinationPerson)
    context('Destination person', name(object(object(refs.destinationPerson).subject)));
  const referenceLabel = (value: unknown, id: unknown, depth = 0): string | undefined => {
    if (!id) return 'No selection';
    if (depth > 4 || !value || typeof value !== 'object') return undefined;
    if (object(value).id === id) return name(object(value));
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = referenceLabel(child, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  for (const [field, label] of [
    ['locationId', 'Location'],
    ['parentId', 'Parent location'],
    ['supermarketProfileId', 'Store'],
    ['aisleId', 'Aisle'],
    ['aisleIds', 'Aisle order'],
    ['tagIds', 'Tags'],
    ['tagId', 'Tag'],
    ['collectionId', 'Collection'],
  ]) {
    if (!(field in body)) continue;
    const selected = body[field];
    const text = (ids: unknown) =>
      Array.isArray(ids)
        ? ids.length
          ? ids.map((id) => referenceLabel(refs[field], id) ?? 'Record unavailable').join(', ')
          : 'None'
        : (referenceLabel(refs[field], ids) ?? 'Record unavailable');
    review.changes.push({
      label,
      ...(field in target ? { before: text(target[field]) } : {}),
      after: limit(text(selected)),
    });
  }
  const omit =
    /(?:Id$|Ids$|Json$|^expected|^version$|^operationKey$|^commandId$|^operationId$|ExpectedUpdatedAt$|^idempotencyKey$|^id$)/u;
  let changeCount = 0;
  const changes = (next: RecordValue, previous: RecordValue, prefix = '', depth = 0) => {
    for (const [key, value] of Object.entries(next)) {
      if (
        omit.test(key) ||
        (kind === 'Shopping item' && ['cartQuantity', 'cartUnit'].includes(key)) ||
        JSON.stringify(value) === JSON.stringify(previous[key])
      )
        continue;
      if (key === 'clearFields' && Array.isArray(value)) {
        for (const field of value)
          if (typeof field === 'string') {
            review.changes.push({
              label: fieldName(field),
              before: valueText(object(target.interview)[field]),
              after: 'Cleared',
            });
          }
        continue;
      }
      const label = `${prefix}${fieldName(key)}`;
      const before = previous[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && depth < 3) {
        changes(object(value), object(before), `${label} · `, depth + 1);
      } else if (Array.isArray(value) && depth < 2) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object')
            changes(
              object(item),
              object(Array.isArray(before) ? before[index] : undefined),
              `${label} ${index + 1} · `,
              depth + 1,
            );
          else if (changeCount++ < 60)
            review.changes.push({ label: `${label} ${index + 1}`, after: valueText(item) });
        });
        if (!value.length && changeCount++ < 60)
          review.changes.push({ label, before: valueText(before), after: 'None' });
      } else if (changeCount++ < 60)
        review.changes.push({
          label,
          ...(key in previous ? { before: valueText(before, key) } : {}),
          after: valueText(value, key),
        });
    }
  };
  if (!image && input.body != null) {
    if (operationId === 'updateMyKitchenContext') {
      changes(object(body.interviewPatch ?? body.interview), object(root.interview));
      if (Array.isArray(body.clearFields)) changes({ clearFields: body.clearFields }, target);
    } else changes(body, target);
  }
  if (changeCount > 60 || review.changes.length > 60)
    review.caveats.push(
      `${Math.max(changeCount, review.changes.length) - 60} additional fields are omitted from this compact review. Open the protected workspace to review a smaller change.`,
    );
  review.context = review.context.slice(0, 12);
  return review;
}
