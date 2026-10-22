import { resolveRecipeForExport } from '@/lib/services/effective-recipe-export-service';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';
import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

import { recipeAsMarkdown } from '@/lib/services/recipe-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function downloadName(title: string): string {
  const stem = title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 80);
  return `${stem || 'recipe'}.md`;
}

export async function GET(_request: Request, context: { params: Promise<{ recipeId: string }> }) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  let recipe;
  try {
    recipe = resolveRecipeForExport(
      access.principal,
      (await context.params).recipeId,
      new URL(_request.url).searchParams,
    );
  } catch (error) {
    return withApiRequestId(decisionErrorResponse(error), access.requestId);
  }
  if (!recipe) {
    return withApiRequestId(
      NextResponse.json(
        { error: { code: 'recipe_not_found', message: 'That recipe no longer exists.' } },
        { status: 404 },
      ),
      access.requestId,
    );
  }
  return withApiRequestId(
    new NextResponse(recipeAsMarkdown(recipe), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${downloadName(recipe.title)}"`,
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    }),
    access.requestId,
  );
}
