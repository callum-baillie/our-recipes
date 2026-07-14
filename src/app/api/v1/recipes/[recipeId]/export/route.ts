import { NextResponse } from 'next/server';

import { exportRecipeAsJsonLd } from '@/lib/services/jsonld-service';

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
  const { recipeId } = await context.params;
  const document = exportRecipeAsJsonLd(recipeId);
  if (!document) {
    return NextResponse.json(
      { error: { code: 'recipe_not_found', message: 'That recipe no longer exists.' } },
      { status: 404 },
    );
  }
  return new NextResponse(`${JSON.stringify(document, null, 2)}\n`, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${downloadName(String(document.name))}"`,
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
