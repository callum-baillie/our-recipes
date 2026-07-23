export const PRODUCT_NAME = 'Bòrd';
export const PRODUCT_SLUG = 'bord';
export const DEFAULT_KITCHEN_NAME = PRODUCT_NAME;

function comparableName(value: string): string {
  return value.normalize('NFKD').replaceAll(/\p{M}/gu, '').trim().toLocaleLowerCase('en');
}

export function isProductKitchenName(value: string): boolean {
  return comparableName(value) === PRODUCT_SLUG;
}

export function hasCustomKitchenIdentity(kitchenName: string, kitchenIcon: string): boolean {
  return !isProductKitchenName(kitchenName) || kitchenIcon !== 'table';
}

export function brandedKitchenTitle(kitchenName: string): string {
  const trimmed = kitchenName.trim() || DEFAULT_KITCHEN_NAME;
  return isProductKitchenName(trimmed) ? PRODUCT_NAME : `${trimmed} · ${PRODUCT_NAME}`;
}

export function brandedPageTitle(pageTitle: string, kitchenName: string): string {
  return `${pageTitle} · ${brandedKitchenTitle(kitchenName)}`;
}

export function kitchenFooterCopy(kitchenName: string): string {
  const trimmed = kitchenName.trim() || DEFAULT_KITCHEN_NAME;
  return isProductKitchenName(trimmed)
    ? `${PRODUCT_NAME} · Getting everyone to the table.`
    : `${trimmed} · Powered by ${PRODUCT_NAME}.`;
}

export function legacyKitchenName(appName: string, householdName: string): string {
  const app = appName.trim();
  const household = householdName.trim();
  const legacyDefault = /^(our recipes|our kitchen)$/iu;
  if (app && !legacyDefault.test(app)) return app;
  if (household && !legacyDefault.test(household)) return household;
  return DEFAULT_KITCHEN_NAME;
}
