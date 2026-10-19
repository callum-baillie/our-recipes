export const RECIPEBOOK_ROUTES = [
  '/recipes',
  '/collections',
  '/tags',
  '/import',
  '/capture',
] as const;
export function isRecipebookRoute(pathname: string): boolean {
  return RECIPEBOOK_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
