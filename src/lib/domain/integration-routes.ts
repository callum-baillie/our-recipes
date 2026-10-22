import type { ApiAction, ApiResource } from '@/lib/domain/auth';

export type IntegrationRoute = {
  path: string;
  resource: ApiResource;
  methods: Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', ApiAction>>;
};

// Explicit allowlist shared by the proxy, route authorization, and API documentation.
// Personal nutrition, account security, backups, and AI assistant conversations stay session-only.
export const integrationRoutes: IntegrationRoute[] = [
  {
    path: '/shopping-lists/{listId}/catalog-items',
    resource: 'shoppingLists',
    methods: { POST: 'create' },
  },
  { path: '/food-data/catalog/measures', resource: 'pantry', methods: { POST: 'read' } },
  { path: '/food-data/catalog/storage-guidance', resource: 'pantry', methods: { POST: 'read' } },
  { path: '/food-data/catalog/enrichment', resource: 'shoppingLists', methods: { POST: 'read' } },
  { path: '/food-data/catalog/status', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/food-data/catalog/chains', resource: 'shoppingLists', methods: { POST: 'read' } },
  { path: '/food-data/catalog/stores', resource: 'shoppingLists', methods: { POST: 'read' } },
  { path: '/food-data/catalog/retail-evidence', resource: 'pantry', methods: { POST: 'read' } },
  {
    path: '/supermarket-profiles/{profileId}/catalog-link',
    resource: 'shoppingLists',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'update' },
  },
  { path: '/shopping-lists/recent-items', resource: 'shoppingLists', methods: { GET: 'read' } },
  {
    path: '/shopping-lists/{listId}/items/bulk',
    resource: 'shoppingLists',
    methods: { POST: 'create' },
  },
  { path: '/pantry/export/pdf', resource: 'pantry', methods: { POST: 'read' } },
  {
    path: '/shopping-lists/{listId}/export/pdf',
    resource: 'shoppingLists',
    methods: { POST: 'read' },
  },
  { path: '/exports/recipes/pdf', resource: 'recipes', methods: { POST: 'read' } },
  { path: '/recipes/{recipeId}/export/pdf', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/meal-plan/export/pdf', resource: 'mealPlans', methods: { POST: 'read' } },
  { path: '/capture-drafts', resource: 'recipes', methods: { POST: 'create' } },
  {
    path: '/collections/{collectionId}/recipes',
    resource: 'collections',
    methods: { POST: 'create', PUT: 'update' },
  },
  {
    path: '/collections/{collectionId}',
    resource: 'collections',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'delete' },
  },
  { path: '/collections/bulk', resource: 'collections', methods: { GET: 'read' } },
  { path: '/collections/order', resource: 'collections', methods: { POST: 'update' } },
  { path: '/collections', resource: 'collections', methods: { GET: 'read', POST: 'create' } },
  { path: '/cook-sessions/{sessionId}/complete', resource: 'recipes', methods: { POST: 'update' } },
  {
    path: '/cook-sessions/{sessionId}/pantry',
    resource: 'recipes',
    methods: { GET: 'read', POST: 'read' },
  },
  {
    path: '/cook-sessions/{sessionId}/pantry/undo',
    resource: 'recipes',
    methods: { POST: 'update' },
  },
  { path: '/cook-sessions', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/exports/recipes', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/food-data/barcode-lookups', resource: 'pantry', methods: { POST: 'read' } },
  { path: '/food-data/details', resource: 'pantry', methods: { POST: 'read' } },
  { path: '/food-data/imports', resource: 'pantry', methods: { POST: 'create' } },
  { path: '/food-data/searches', resource: 'pantry', methods: { POST: 'read' } },
  { path: '/food-data/status', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/imports/{importId}/confirm', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/imports/{importId}/file', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/imports/{importId}/files/{artifactId}', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/imports/{importId}', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/imports', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/jsonld-drafts/confirm', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/jsonld-drafts', resource: 'recipes', methods: { POST: 'create' } },
  {
    path: '/meal-plan/{entryId}/refresh-recipe',
    resource: 'mealPlans',
    methods: { POST: 'update' },
  },
  {
    path: '/meal-plan/{entryId}',
    resource: 'mealPlans',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'delete' },
  },
  { path: '/meal-plan/batch', resource: 'mealPlans', methods: { POST: 'create' } },
  { path: '/meal-plan/bulk', resource: 'mealPlans', methods: { GET: 'read' } },
  { path: '/meal-plan/duplicate', resource: 'mealPlans', methods: { POST: 'create' } },
  { path: '/meal-plan/export', resource: 'mealPlans', methods: { GET: 'read' } },
  { path: '/kitchen', resource: 'kitchen', methods: { GET: 'read', POST: 'update' } },
  { path: '/kitchen/catalog', resource: 'kitchen', methods: { GET: 'read' } },
  { path: '/kitchen/check', resource: 'kitchen', methods: { POST: 'read' } },
  { path: '/kitchen/claims', resource: 'kitchen', methods: { POST: 'update', GET: 'read' } },
  { path: '/meal-plan', resource: 'mealPlans', methods: { GET: 'read', POST: 'create' } },
  { path: '/meal-plan/swap', resource: 'mealPlans', methods: { POST: 'update' } },
  { path: '/pantry/batches/{batchId}/actions', resource: 'pantry', methods: { POST: 'update' } },
  {
    path: '/pantry/batches/{batchId}',
    resource: 'pantry',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'delete' },
  },
  { path: '/pantry/batches/bulk', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/pantry/batches', resource: 'pantry', methods: { GET: 'read', POST: 'create' } },
  { path: '/pantry/catalog-imports', resource: 'pantry', methods: { POST: 'create' } },
  { path: '/pantry/demand', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/pantry/events', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/pantry/locations/{locationId}', resource: 'pantry', methods: { PATCH: 'update' } },
  { path: '/pantry/locations', resource: 'pantry', methods: { GET: 'read', POST: 'create' } },
  {
    path: '/pantry/mappings/{ingredientId}',
    resource: 'pantry',
    methods: { PUT: 'update', DELETE: 'delete' },
  },
  {
    path: '/pantry/products/{productId}',
    resource: 'pantry',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'delete' },
  },
  { path: '/pantry/products', resource: 'pantry', methods: { GET: 'read', POST: 'create' } },
  { path: '/pantry/recipes/{recipeId}/availability', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/pantry/summary', resource: 'pantry', methods: { GET: 'read' } },
  { path: '/recipes/{recipeId}/duplicate', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/recipes/{recipeId}/export/markdown', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/recipes/{recipeId}/export', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/recipes/{recipeId}/favorite', resource: 'recipes', methods: { PUT: 'update' } },
  {
    path: '/recipes/{recipeId}/images/{imageId}',
    resource: 'recipes',
    methods: { GET: 'read', DELETE: 'delete' },
  },
  {
    path: '/recipes/{recipeId}/image-candidates/{candidateId}',
    resource: 'recipes',
    methods: { GET: 'read', POST: 'update', DELETE: 'delete' },
  },
  {
    path: '/recipes/{recipeId}/image-candidates/{candidateId}/file',
    resource: 'recipes',
    methods: { GET: 'read' },
  },
  { path: '/recipes/{recipeId}/images/generate', resource: 'recipes', methods: { POST: 'update' } },
  { path: '/recipes/{recipeId}/images', resource: 'recipes', methods: { POST: 'create' } },
  { path: '/recipes/{recipeId}/improve', resource: 'recipes', methods: { POST: 'update' } },
  {
    path: '/recipes/{recipeId}/nutrition/estimate',
    resource: 'recipes',
    methods: { POST: 'update' },
  },
  {
    path: '/recipes/{recipeId}/preference',
    resource: 'recipes',
    methods: { PUT: 'update', PATCH: 'update' },
  },
  {
    path: '/recipes/{recipeId}/revisions/{revision}/restore',
    resource: 'recipes',
    methods: { POST: 'update' },
  },
  {
    path: '/recipes/{recipeId}',
    resource: 'recipes',
    methods: { GET: 'read', PUT: 'update', DELETE: 'delete' },
  },
  { path: '/recipes/{recipeId}/status', resource: 'recipes', methods: { PATCH: 'update' } },
  { path: '/recipes/{recipeId}/tags', resource: 'recipes', methods: { PATCH: 'update' } },
  { path: '/recipes/bulk', resource: 'recipes', methods: { GET: 'read' } },
  { path: '/recipes', resource: 'recipes', methods: { GET: 'read', POST: 'create' } },
  { path: '/settings/lists', resource: 'settings', methods: { GET: 'read', PATCH: 'update' } },
  {
    path: '/settings/preferences',
    resource: 'settings',
    methods: { GET: 'read', PATCH: 'update' },
  },
  {
    path: '/shopping-list-aisles/{aisleId}',
    resource: 'shoppingLists',
    methods: { DELETE: 'delete' },
  },
  {
    path: '/shopping-lists/{listId}/items/{itemId}/pantry-controls',
    resource: 'shoppingLists',
    methods: { PATCH: 'update' },
  },
  {
    path: '/shopping-lists/{listId}/items/{itemId}/pantry-intake',
    resource: 'shoppingLists',
    methods: { POST: 'update' },
  },
  {
    path: '/shopping-lists/{listId}/items/{itemId}/pantry-match',
    resource: 'shoppingLists',
    methods: { PATCH: 'update' },
  },
  {
    path: '/shopping-lists/{listId}/items/{itemId}',
    resource: 'shoppingLists',
    methods: { PATCH: 'update', DELETE: 'delete' },
  },
  {
    path: '/shopping-lists/{listId}/items',
    resource: 'shoppingLists',
    methods: { POST: 'create' },
  },
  {
    path: '/shopping-lists/{listId}/policies/{productId}',
    resource: 'shoppingLists',
    methods: { PATCH: 'update' },
  },
  {
    path: '/shopping-lists/{listId}/retry-store',
    resource: 'shoppingLists',
    methods: { POST: 'update' },
  },
  {
    path: '/shopping-lists/{listId}',
    resource: 'shoppingLists',
    methods: { GET: 'read', PATCH: 'update', DELETE: 'delete' },
  },
  {
    path: '/shopping-lists/{listId}/supermarket-profile',
    resource: 'shoppingLists',
    methods: { PATCH: 'update' },
  },
  {
    path: '/shopping-lists/aisles/{aisleId}',
    resource: 'shoppingLists',
    methods: { DELETE: 'delete' },
  },
  {
    path: '/shopping-lists/aisles',
    resource: 'shoppingLists',
    methods: { GET: 'read', POST: 'create', PATCH: 'update' },
  },
  { path: '/shopping-lists/bulk', resource: 'shoppingLists', methods: { GET: 'read' } },
  {
    path: '/shopping-lists/pantry-shortages',
    resource: 'shoppingLists',
    methods: { POST: 'create' },
  },
  { path: '/shopping-lists', resource: 'shoppingLists', methods: { GET: 'read', POST: 'create' } },
  {
    path: '/supermarket-profiles/{profileId}/duplicate',
    resource: 'shoppingLists',
    methods: { POST: 'create' },
  },
  {
    path: '/supermarket-profiles/{profileId}',
    resource: 'shoppingLists',
    methods: { PATCH: 'update' },
  },
  {
    path: '/supermarket-profiles',
    resource: 'shoppingLists',
    methods: { GET: 'read', POST: 'update' },
  },
  { path: '/tags/{tagName}/merge', resource: 'recipes', methods: { POST: 'update' } },
  { path: '/tags/{tagName}', resource: 'recipes', methods: { PATCH: 'update', DELETE: 'delete' } },
  { path: '/tags', resource: 'recipes', methods: { GET: 'read', POST: 'update' } },
  {
    path: '/nutrition/recipes/{recipeId}/calculations',
    resource: 'recipes',
    methods: { GET: 'read', POST: 'update' },
  },
  {
    path: '/nutrition/products/{productId}/records',
    resource: 'pantry',
    methods: { GET: 'read', POST: 'update' },
  },
];

const compiledRoutes = integrationRoutes.map((route) => ({
  ...route,
  pattern: new RegExp(`^/api/v1${route.path.replace(/\{[^}]+\}/gu, '[^/]+')}/?$`, 'u'),
}));

export function integrationPermission(pathname: string, method: string) {
  for (const route of compiledRoutes) {
    if (!route.pattern.test(pathname)) continue;
    const action = route.methods[method.toUpperCase() as keyof typeof route.methods];
    if (action) return { resource: route.resource, action };
  }
  return null;
}

/** Explicit stock-changing workflows need a pantry grant as well as their primary scope. */
export function additionalIntegrationPermissions(
  pathname: string,
  method: string,
): Array<{ resource: ApiResource; action: ApiAction }> {
  if (
    /^\/api\/v1\/shopping-lists\/[^/]+\/catalog-items\/?$/u.test(pathname) &&
    method.toUpperCase() === 'POST'
  )
    return [
      { resource: 'pantry', action: 'create' },
      { resource: 'shoppingLists', action: 'update' },
    ];
  if (pathname === '/api/v1/kitchen/check' && method.toUpperCase() === 'POST')
    return [{ resource: 'recipes', action: 'read' }];
  if (pathname === '/api/v1/meal-plan/export/pdf' && method.toUpperCase() === 'POST')
    return [{ resource: 'recipes', action: 'read' }];
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return [];
  if (
    /^\/api\/v1\/cook-sessions\/[^/]+\/(?:complete|pantry\/undo)\/?$/u.test(pathname) ||
    /^\/api\/v1\/shopping-lists\/[^/]+\/(?:items\/[^/]+\/pantry-intake|policies\/[^/]+)\/?$/u.test(
      pathname,
    )
  )
    return [{ resource: 'pantry', action: 'update' }];
  return [];
}
