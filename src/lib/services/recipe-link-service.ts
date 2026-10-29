import 'server-only';
import { z } from 'zod';
import { getRuntimeConfig } from '@/lib/config';
import { ScannerError } from '@/lib/domain/scanner';
export function recipeCardUrl(recipeId: string) {
  return new URL(
    `/recipes/${z.string().uuid().parse(recipeId)}`,
    getRuntimeConfig().appOrigin ?? getRuntimeConfig().auth.baseUrl,
  ).href;
}
export function recipeIdFromCardUrl(value: string) {
  const url = new URL(value);
  const origin = new URL(getRuntimeConfig().appOrigin ?? getRuntimeConfig().auth.baseUrl).origin;
  const match = /^\/recipes\/([^/]+)$/.exec(url.pathname);
  const id = z.string().uuid().safeParse(match?.[1]);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !id.success
  )
    throw new ScannerError(
      'scanner_recipe_link_invalid',
      'Scan a recipe link printed by this Bòrd household. No external URL was opened.',
      400,
    );
  return id.data;
}
