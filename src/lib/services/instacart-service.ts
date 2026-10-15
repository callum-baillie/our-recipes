import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '@/lib/db/client';
import { shoppingListInstacartLinks } from '@/lib/db/schema';

export class InstacartError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function instacartConfigured() {
  return !!process.env.INSTACART_API_KEY?.trim();
}
const pending = new Map<string, Promise<string>>();
export async function createInstacartLink(listId: string, payload: unknown) {
  const key = process.env.INSTACART_API_KEY?.trim();
  if (!key)
    throw new InstacartError(
      'Instacart needs a Developer Platform API key. Ask your server administrator to configure it.',
      503,
    );
  const host =
    process.env.INSTACART_ENVIRONMENT === 'development'
      ? 'https://connect.dev.instacart.tools'
      : 'https://connect.instacart.com';
  const hash = createHash('sha256')
    .update(JSON.stringify([host, payload]))
    .digest('hex');
  const cached = getDatabase()
    .select()
    .from(shoppingListInstacartLinks)
    .where(eq(shoppingListInstacartLinks.listId, listId))
    .get();
  if (cached?.contentHash === hash && cached.expiresAt.getTime() > Date.now()) return cached.url;
  const pendingKey = `${listId}:${hash}`;
  const existing = pending.get(pendingKey);
  if (existing) return existing;
  if (pending.size >= 3)
    throw new InstacartError('Please wait for the current shopping links to finish.', 429);
  const operation = (async () => {
    let response: Response;
    try {
      response = await fetch(`${host}/idp/v1/products/products_link`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new InstacartError('Instacart could not be reached. Please try again.');
    }
    if (!response.ok)
      throw new InstacartError(
        response.status === 429
          ? 'Instacart is busy. Please try again shortly.'
          : 'Instacart could not create this list. Check your items and server API key.',
        response.status === 429 ? 429 : 502,
      );
    const result = z
      .object({ products_link_url: z.string().url() })
      .safeParse(await response.json().catch(() => null));
    if (!result.success) throw new InstacartError('Instacart returned an invalid shopping link.');
    const url = new URL(result.data.products_link_url);
    const allowed = [
      'instacart.com',
      'instacart.ca',
      ...(host.includes('.dev.') ? ['instacart.tools'] : []),
    ];
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    )
      throw new InstacartError('Instacart returned an unexpected shopping link.');
    const values = {
      listId,
      contentHash: hash,
      url: url.href,
      expiresAt: new Date(Date.now() + 6 * 86400_000),
    };
    getDatabase()
      .insert(shoppingListInstacartLinks)
      .values(values)
      .onConflictDoUpdate({ target: shoppingListInstacartLinks.listId, set: values })
      .run();
    return url.href;
  })();
  pending.set(pendingKey, operation);
  try {
    return await operation;
  } finally {
    pending.delete(pendingKey);
  }
}
