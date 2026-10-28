import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { authorizeCoreApi, withApiRequestId } from '@/lib/api-auth';
import { ScannerError } from '@/lib/domain/scanner';
import { FoodDataError } from '@/lib/domain/food-data';
import { foodDataApiError } from '../food-data/_shared';
import { jsonError } from '@/lib/http';
import {
  scannerContext,
  lookupScanner,
  executeScannerRequest,
  replayLegacyScanner,
  registerScannerStation,
  scannerStationList,
  scannerStationDetail,
  createScannerControl,
  syncScannerStation,
  scannerReceipt,
} from '@/lib/services/scanner-station-service';
import { scannerSession } from '@/lib/services/scanner-session-service';

async function body(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ScannerError('scanner_invalid_json', 'Send a JSON body.', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new ScannerError(
          'scanner_body_too_large',
          'Scanner request exceeds the size limit.',
          413,
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ScannerError('scanner_invalid_json', 'Send valid JSON.', 400);
  }
}
export async function handleScanner(
  request: Request,
  operation: string,
  id = '',
  authorization?: Awaited<ReturnType<typeof authorizeCoreApi>>,
) {
  const access = authorization ?? (await authorizeCoreApi(request));
  if (access.response) return access.response;
  const reply = (response: Response) => withApiRequestId(response, access.requestId);
  try {
    const p = access.principal;
    let result: unknown;
    switch (operation) {
      case 'context':
        result = scannerContext(p, new URL(request.url).searchParams.get('stationId') ?? '');
        break;
      case 'lookup':
        result = await lookupScanner(p, await body(request, 8192));
        break;
      case 'operation': {
        const raw = await body(request, 8192);
        const outcome =
          raw && typeof raw === 'object' && 'contractVersion' in raw
            ? await executeScannerRequest(p, raw)
            : replayLegacyScanner(p, raw);
        return reply(NextResponse.json(outcome.result, { status: outcome.status }));
      }
      case 'receipt': {
        const outcome = scannerReceipt(p, id);
        return reply(NextResponse.json(outcome.result, { status: outcome.status }));
      }
      case 'register':
        result = registerScannerStation(p, await body(request, 8192));
        break;
      case 'stations':
        result = { stations: scannerStationList(p) };
        break;
      case 'station':
        result = scannerStationDetail(p, id);
        break;
      case 'session': {
        const since = new URL(request.url).searchParams.get('since');
        if (since !== null && (!/^\d+$/u.test(since) || !Number.isSafeInteger(Number(since))))
          throw new ScannerError('scanner_invalid_since', 'Use a valid scan list timestamp.', 400);
        result = scannerSession(p, id, since === null ? undefined : Number(since));
        break;
      }
      case 'control':
        result = createScannerControl(p, id, await body(request, 8192));
        break;
      case 'sync':
        result = syncScannerStation(p, id, await body(request, 65536));
        break;
      default:
        throw new ScannerError('scanner_route_missing', 'Unknown scanner operation.', 404);
    }
    if (Buffer.byteLength(JSON.stringify(result)) > 65536)
      throw new ScannerError(
        'scanner_response_too_large',
        'Narrow this scanner query or use the regular Bòrd editor.',
        413,
      );
    return reply(NextResponse.json(result));
  } catch (error) {
    if (error instanceof ScannerError)
      return reply(jsonError(error.status, error.code, error.message));
    if (error instanceof ZodError)
      return reply(
        jsonError(400, 'scanner_invalid_input', 'Review the scanner input and required fields.'),
      );
    if (error instanceof FoodDataError) return reply(foodDataApiError(error));
    throw error;
  }
}
