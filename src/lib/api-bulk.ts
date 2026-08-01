import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/http';

const MAX_BULK_ITEMS = 50_000;
const MAX_BULK_BYTES = 100 * 1024 * 1024;

export function ndjsonBulkResponse(
  resource: string,
  records: unknown[],
  requestId: string,
): Response {
  if (records.length > MAX_BULK_ITEMS) {
    const response = jsonError(
      413,
      'bulk_export_too_large',
      `This export exceeds the ${MAX_BULK_ITEMS.toLocaleString('en-US')} item limit.`,
    );
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  const snapshotAt = new Date().toISOString();
  const lines = [
    JSON.stringify({
      type: 'snapshot',
      resource,
      snapshotAt,
      count: records.length,
    }),
    ...records.map((record) => JSON.stringify({ type: 'item', data: record })),
  ];
  const body = `${lines.join('\n')}\n`;
  if (Buffer.byteLength(body, 'utf8') > MAX_BULK_BYTES) {
    const response = jsonError(
      413,
      'bulk_export_too_large',
      'This export exceeds the 100 MB response limit. Use updatedSince to request a smaller slice.',
    );
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Request-Id': requestId,
      'X-Snapshot-At': snapshotAt,
    },
  });
}
