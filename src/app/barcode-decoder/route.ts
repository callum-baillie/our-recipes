import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let decoderBytes: Promise<Buffer> | undefined;

function loadDecoder() {
  decoderBytes ??= readFile(
    resolve(process.cwd(), 'public', 'vendor', 'barcode', 'zxing_reader.wasm'),
  );
  return decoderBytes;
}

export async function GET() {
  const bytes = await loadDecoder();

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'application/wasm',
      ETag: `"${bytes.byteLength.toString(16)}"`,
    },
  });
}
