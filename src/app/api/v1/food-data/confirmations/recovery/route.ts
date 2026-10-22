import { z } from 'zod';
import {
  authorizeApi,
  authorizeCoreApi,
  requireTrustedSessionMutation,
  withApiRequestId,
} from '@/lib/api-auth';
import { prepareIdempotentMutation, executeIdempotentMutation } from '@/lib/api-idempotency';
import { pantryBatchInputSchema } from '@/lib/domain/pantry';
import {
  foodCatalogImportInputSchema,
  foodCatalogShoppingInputSchema,
} from '@/lib/domain/food-data';
import { getDatabase } from '@/lib/db/client';
import {
  parseCatalogBatch,
  replayFoodCatalogImport,
  replayCatalogShoppingItem,
} from '@/lib/services/food-catalog-import-service';
import { jsonError } from '@/lib/http';
import { foodDataApiError, readFoodDataJson } from '../../_shared';

const inputSchema = z
  .object({
    operationId: z.string().uuid(),
    action: z.enum(['inspect', 'abandon']),
    actor: z.object({ userId: z.string().min(1), profileId: z.string().uuid() }).strict(),
    commandPath: z.union([
      z.literal('/api/v1/pantry/batches'),
      z.literal('/api/v1/pantry/catalog-imports'),
      z.string().regex(/^\/api\/v1\/shopping-lists\/[0-9a-f-]{36}\/catalog-items$/i),
    ]),
    // Preserve exact submitted JSON for the receipt hash. Each destination is validated strictly below.
    command: z.record(z.string(), z.unknown()),
  })
  .strict();
const catalogPantrySchema = foodCatalogImportInputSchema
  .extend({ batches: z.array(z.unknown()).min(1).max(20) })
  .strict();
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Inspection and explicit closure never create stock, import food, or change a cart. */
export async function POST(request: Request) {
  const access = await authorizeApi(request, 'pantry', 'create');
  if (access.response) return access.response;
  const origin = requireTrustedSessionMutation(request, access.principal, access.requestId);
  if (origin) return origin;
  try {
    const input = inputSchema.parse(await readFoodDataJson(request));
    if (input.actor.userId !== access.principal.userId)
      return jsonError(
        403,
        'original_account_required',
        'Return to the original signed-in account to review this confirmation.',
      );
    if (input.actor.profileId !== access.principal.profileId)
      return jsonError(
        409,
        'reviewed_actor_changed',
        'Return to the original viewing profile to review this confirmation.',
      );
    const headers = new Headers(request.headers);
    headers.set('Idempotency-Key', input.operationId);
    const original = new Request(new URL(input.commandPath, request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(input.command),
    });
    const originalAccess = await authorizeCoreApi(original);
    if (originalAccess.response) return originalAccess.response;
    let replayDomain: () => unknown = () => null;
    if (input.commandPath === '/api/v1/pantry/batches') {
      pantryBatchInputSchema.parse(input.command);
    } else {
      if (input.command.operationId !== input.operationId)
        return jsonError(
          400,
          'invalid_confirmation_identity',
          'Supply the original operation ID and its unchanged command.',
        );
      if (input.commandPath === '/api/v1/pantry/catalog-imports') {
        const { batches, ...catalogInput } = catalogPantrySchema.parse(input.command);
        batches.forEach(parseCatalogBatch);
        replayDomain = () =>
          replayFoodCatalogImport(
            catalogInput,
            'pantry',
            access.principal.profileId,
            batches,
            access.principal.userId,
          );
      } else {
        const listId = z.string().uuid().parse(input.commandPath.split('/')[4]);
        const command = foodCatalogShoppingInputSchema.parse(input.command);
        replayDomain = () =>
          replayCatalogShoppingItem({
            input: command,
            listId,
            actorProfileId: access.principal.profileId,
            actorUserId: access.principal.userId,
          });
      }
    }
    const prepared = await prepareIdempotentMutation(original, access.principal, access.requestId);
    const acknowledged = (result: unknown) =>
      withApiRequestId(Response.json({ status: 'acknowledged', result }), access.requestId);
    const describe = async (response: Response) => {
      const body = await response.json();
      if (body.recovery?.status === 'abandoned')
        return withApiRequestId(
          Response.json({
            status: 'abandoned',
            outcome: 'unknown',
            message:
              'Further execution of this operation is blocked. Any earlier write has not been undone.',
          }),
          access.requestId,
        );
      if (!response.ok)
        return withApiRequestId(Response.json(body, { status: response.status }), access.requestId);
      return acknowledged(body);
    };
    if (prepared.response) return describe(prepared.response);
    const receipt = replayDomain();
    if (receipt) return acknowledged(receipt);
    if (input.action === 'inspect')
      return withApiRequestId(
        Response.json({
          status: 'not_recorded',
          outcome: 'unknown',
          message:
            'No retained receipt was found. This does not prove an older request did not commit. Review the saved destination before continuing.',
        }),
        access.requestId,
      );
    const outcome = getDatabase().transaction(
      () => {
        // Recheck domain receipts under the same SQLite write lock used by the original operation.
        const committed = replayDomain();
        if (committed) return acknowledged(committed);
        return executeIdempotentMutation(
          prepared.context,
          () => ({
            error: {
              code: 'operation_abandoned',
              message:
                'This original confirmation was closed after review. It cannot execute again.',
            },
            recovery: {
              status: 'abandoned',
              outcome: 'unknown',
              reviewedAt: new Date().toISOString(),
            },
          }),
          access.requestId,
          409,
        );
      },
      { behavior: 'immediate' },
    );
    // A domain acknowledgement is already in the recovery response shape.
    if (outcome.ok) return outcome;
    return describe(outcome);
  } catch (error) {
    return withApiRequestId(foodDataApiError(error), access.requestId);
  }
}
