import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { resolveRecipeForExport } from '@/lib/services/effective-recipe-export-service';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { recipeAsJsonLd } from '@/lib/services/jsonld-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function downloadName(title: string): string {
  const stem = title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 80);
  return `${stem || 'recipe'}.jsonld`;
}

export async function GET(_request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  const { recipeId } = await context.params;
  let document;
  try {
    const recipe = resolveRecipeForExport(
      access.principal,
      recipeId,
      new URL(_request.url).searchParams,
    );
    document = recipe ? recipeAsJsonLd(recipe) : null;
  } catch (error) {
    return withApiRequestId(decisionErrorResponse(error), access.requestId);
  }
  if (!document) {
    return withApiRequestId(
      NextResponse.json(
        { error: { code: 'recipe_not_found', message: 'That recipe no longer exists.' } },
        { status: 404 },
      ),
      access.requestId,
    );
  }
  return withApiRequestId(
    new NextResponse(`${JSON.stringify(document, null, 2)}\n`, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${downloadName(String(document.name))}"`,
        'Content-Type': 'application/ld+json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    }),
    access.requestId,
  );
}
