import {
  decisionPrincipal,
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import {
  confirmAppActions,
  reviseAppActions,
  listPendingAppActions,
} from '@/lib/services/ai-app-action-service';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    return Response.json(
      await confirmAppActions(
        await decisionPrincipal(request),
        request,
        await boundedDecisionJson(request),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    return Response.json(
      {
        proposals: listPendingAppActions(
          await decisionPrincipal(request),
          new URL(request.url).searchParams.get('threadId') ?? '',
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    return Response.json(
      await reviseAppActions(
        await decisionPrincipal(request),
        request,
        await boundedDecisionJson(request, 180000),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
