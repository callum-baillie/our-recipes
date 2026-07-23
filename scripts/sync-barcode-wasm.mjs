import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const barcodeDetectorEntrypoint = require.resolve('barcode-detector/ponyfill');
const barcodeDetectorRequire = createRequire(barcodeDetectorEntrypoint);
const zxingReaderEntrypoint = barcodeDetectorRequire.resolve('zxing-wasm/reader');
const source = resolve(dirname(zxingReaderEntrypoint), '..', '..', 'reader', 'zxing_reader.wasm');
const destination = resolve('public/vendor/barcode/zxing_reader.wasm');
const digestFile = `${destination}.sha256`;

const sourceBytes = await readFile(source);
const sourceDigest = createHash('sha256').update(sourceBytes).digest('hex');
let destinationDigest = '';
try {
  destinationDigest = createHash('sha256')
    .update(await readFile(destination))
    .digest('hex');
} catch {}

await mkdir(dirname(destination), { recursive: true });
if (destinationDigest !== sourceDigest) await copyFile(source, destination);
await writeFile(digestFile, `${sourceDigest}  zxing_reader.wasm\n`, 'utf8');
console.log(`Barcode decoder ready: ${sourceDigest}`);
