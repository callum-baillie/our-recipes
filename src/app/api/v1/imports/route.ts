import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import {
  importClientConversionsSchema,
  MAX_IMPORT_BYTES,
  ImportValidationError,
} from '@/lib/domain/import';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
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
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This import must come from a trusted app origin.');
  }
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId) return profileRequired();

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_IMPORT_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return jsonError(413, 'file_too_large', 'Choose a PDF or image no larger than 15 MB.');
  }
  try {
    assertImportRateLimit(actor.profileId);
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    const legacyFile = formData.get('file');
    const transcription = formData.get('transcription');
    if (files.length === 0 && legacyFile instanceof File) files.push(legacyFile);
    if (files.length === 0) {
      return jsonError(
        400,
        'invalid_file',
        'Choose one PDF or up to four recipe scan images to import.',
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
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ImportValidationError) return jsonError(422, error.code, error.message);
    return jsonError(400, 'invalid_import', 'The recipe document could not be imported safely.');
  }
}
