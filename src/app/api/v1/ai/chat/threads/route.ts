import { z } from 'zod';
import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import {
  boundedDecisionJson,
  decisionErrorResponse,
} from '@/lib/services/decision-request-service';
import { createAiChatThread, listAiChatThreads } from '@/lib/services/ai-chat-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const createSchema = z.object({ title: z.string().trim().min(1).max(80).optional() }).strict();
export async function GET(request: Request) {
  try {
    const p = await personalAiPrincipal(request, false);
    return Response.json(
      { threads: listAiChatThreads(p.linkedProfileId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const p = await personalAiPrincipal(request);
    const input = createSchema.parse(await boundedDecisionJson(request));
    return Response.json(
      { thread: createAiChatThread(p.linkedProfileId, input.title) },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return decisionErrorResponse(error);
  }
}
