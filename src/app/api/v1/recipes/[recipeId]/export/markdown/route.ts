import { NextResponse } from 'next/server';

import { getRecipe, recipeAsMarkdown } from '@/lib/services/recipe-service';

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
  const recipe = getRecipe((await context.params).recipeId);
  if (!recipe) {
    return NextResponse.json(
      { error: { code: 'recipe_not_found', message: 'That recipe no longer exists.' } },
      { status: 404 },
    );
  }
  return new NextResponse(recipeAsMarkdown(recipe), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${downloadName(recipe.title)}"`,
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
