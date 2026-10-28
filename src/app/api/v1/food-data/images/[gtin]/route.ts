import { NextResponse } from 'next/server';
import { authorizeApi, withApiRequestId } from '@/lib/api-auth';
import { jsonError } from '@/lib/http';
import { getProductImage } from '@/lib/services/product-image-service';
import { foodDataApiError } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** First-party proxy: the food API key stays on the server and never appears in an image URL. */
export async function GET(request: Request, context: { params: Promise<{ gtin: string }> }) {
  const access = await authorizeApi(request, 'pantry', 'read');
  if (access.response) return access.response;
  const reply = (response: Response) => withApiRequestId(response, access.requestId);
  try {
    const image = await getProductImage((await context.params).gtin);
    if (image.kind === 'missing')
      return reply(
        NextResponse.json(
          {
            error: { code: 'IMAGE_NOT_FOUND', message: 'No photo is available for this barcode.' },
          },
          { status: 404, headers: { 'Cache-Control': 'private, max-age=3600' } },
        ),
      );
    if (image.kind === 'blocked')
      return reply(
        jsonError(403, 'image_source_blocked', 'Photos from this source are not available.'),
      );
    if (image.kind === 'unavailable') {
      const response = jsonError(503, 'image_unavailable', 'The photo is not available right now.');
      response.headers.set('Retry-After', String(image.retryAfter));
      response.headers.set('Cache-Control', 'no-store');
      return reply(response);
    }
    const headers = new Headers({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
      ETag: image.etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (image.attribution) headers.set('X-Image-Attribution', image.attribution);
    if (image.link) headers.set('Link', image.link);
    if (request.headers.get('if-none-match') === image.etag)
      return reply(new Response(null, { status: 304, headers }));
    return reply(new Response(Buffer.from(image.body), { status: 200, headers }));
  } catch (error) {
    return reply(foodDataApiError(error));
  }
}
