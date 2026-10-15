import { withApiRequestId, authorizeCoreApi, actorFromPrincipal } from '@/lib/api-auth';

import { NextResponse } from 'next/server';

import {
  importClientConversionsSchema,
  MAX_IMPORT_BYTES,
  ImportValidationError,
} from '@/lib/domain/import';
import { jsonError } from '@/lib/http';
import { assertImportRateLimit, createImportOperation } from '@/lib/services/import-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MULTIPART_OVERHEAD_BYTES = 128 * 1024;

function parseClientConversions(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = importClientConversionsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function profileRequired() {
  return jsonError(
    409,
    'profile_selection_required',
    'Choose a household profile before importing a recipe document.',
  );
}

export async function POST(request: Request) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  const actor = actorFromPrincipal(access.principal);
  if (!actor.profileId) return withApiRequestId(profileRequired(), access.requestId);

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_IMPORT_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return withApiRequestId(
      jsonError(413, 'file_too_large', 'Choose a PDF or image no larger than 15 MB.'),
      access.requestId,
    );
  }
  try {
    assertImportRateLimit(actor.profileId);
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    const legacyFile = formData.get('file');
    const transcription = formData.get('transcription');
    if (files.length === 0 && legacyFile instanceof File) files.push(legacyFile);
    if (files.length === 0) {
      return withApiRequestId(
        jsonError(
          400,
          'invalid_file',
          'Choose one PDF or up to four recipe scan images to import.',
        ),
        access.requestId,
      );
    }
    const created = await createImportOperation({
      actorProfileId: actor.profileId,
      sources: await Promise.all(
        files.map(async (file) => ({
          sourceName: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
      manualTranscription: typeof transcription === 'string' ? transcription : undefined,
      clientConversions: parseClientConversions(formData.get('clientConversions')),
      autoOpenAiVision: formData.get('autoOpenAiVision') === 'true',
    });
    return withApiRequestId(NextResponse.json(created, { status: 201 }), access.requestId);
  } catch (error) {
    if (error instanceof ImportValidationError)
      return withApiRequestId(jsonError(422, error.code, error.message), access.requestId);
    console.error('Import processing failed before provider review.', error);
    return withApiRequestId(
      jsonError(
        500,
        'import_processing_failed',
        'The app could not process this upload. Your selected files were not saved; try again after checking the server logs.',
      ),
      access.requestId,
    );
  }
}
