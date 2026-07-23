import { parseBrandIcon, paletteIdSchema } from '@/lib/appearance';
import { isBrandIconSize, renderBrandIconPng } from '@/lib/branding-icon-renderer';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ palette: string; icon: string; size: string }> },
) {
  const requested = await params;
  const palette = paletteIdSchema.safeParse(requested.palette);
  const icon = parseBrandIcon(requested.icon);
  const size = Number.parseInt(requested.size.replace(/\.png$/u, ''), 10);
  if (!palette.success || icon !== requested.icon || !isBrandIconSize(size)) {
    return jsonError(404, 'icon_not_found', 'That generated app icon is not available.');
  }

  const rendered = await renderBrandIconPng(palette.data, icon, size);
  return new Response(new Uint8Array(rendered.data), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="bord-${palette.data}-${icon}-${size}.png"`,
      'Content-Length': String(rendered.data.byteLength),
      'Content-Type': 'image/png',
      ETag: rendered.etag,
    },
  });
}
