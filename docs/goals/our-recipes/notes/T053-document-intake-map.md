# T053 — Document-intake completion map

## Current boundary

- `POST /api/v1/imports` accepts exactly one multipart `file` and an optional
  manual `transcription`; it enforces a 15 MB request/file bound, trusted
  origin, selected-profile requirement, and a per-profile six-per-ten-minute
  process limit.
- `src/lib/domain/import.ts` derives type from bytes and accepts only PDF,
  JPEG, PNG, and WebP. `import_operations` has one `storage_key`, one source
  hash, and one derived `kind` (`pdf` or `image`), so it cannot represent a
  scan set without an additive child-artifact model.
- PDF.js parses only supplied PDF bytes with 12-page and 100,000-character
  limits. A scan or textless PDF requires 20–100,000 characters of manual
  transcription. The review UI clearly preserves that provenance.
- `import-storage` accepts one image, bounds dimensions/pixels, rejects
  multi-frame input, strips metadata, and stores one normalized WebP under an
  opaque key. The existing integration tests prove one PDF and one scan.
- Existing `tar@7.5.20` is used for server-created backup bundles, not uploaded
  recipe archives. No public archive intake exists, which is safer than a
  superficially supported extractor.

## Compatibility evidence

The actual Windows runtime reports Sharp `0.35.3`, libvips `8.18.3`, and
libheif `1.23.0`; however `sharp.format.heif` advertises only `.avif` as a
file suffix. The application validation rejects HEIF before Sharp is invoked.
That is not enough evidence to promise HEIC input across the Windows
development machine and Linux/Unraid image. Sharp's official constructor input
list likewise does not present HEIC as a standard supported input, while its
HEIF output documentation warns that HEVC-compressed HEIC support depends on a
globally installed, specially compiled libvips.

Tesseract.js is compatible with Node 24 (its current project documentation
states Node 16+ for v7), but its normal language-model behavior fetches
`*.traineddata` from a CDN. A local deployment must explicitly supply a local
`langPath` and package the model/core assets. Its documentation does not prove
adequate handwriting recognition with the ordinary English model, so adding it
would not by itself satisfy a handwriting-quality claim.

`libheif-js` offers a Node-compatible Emscripten/WASM decoder, but its Node
WASM variant dynamically loads a binary and its package page describes an
LGPL-3.0 license. The convenience `heic-convert` wrapper was last published
three years ago and warns that much conversion work is synchronous. Neither is
safe to adopt without an explicit licensing, memory/CPU-limit, deployment, and
fixture-validation package.

The node-tar project has published archive resource/parse advisories. Any
future archive feature must stream/list before extraction, set byte/entry/depth
limits, reject absolute/traversal names and all links/devices, write only under
an opaque staging root, and prove rejection fixtures. Reusing the backup code
is not an import design.

## Recommended sequence

1. **Safe next Worker package:** add a review-first multi-image scan set for
   the already-supported JPEG/PNG/WebP formats only. Use a strict aggregate
   byte limit, a small fixed item count, each existing image safety bound, one
   operation with additive child artifacts/hashes/order, a combined manual
   transcription, normalized WebP previews, and explicit confirmation. It is
   a coherent user-visible improvement with no new native/runtime dependency.
2. **Separate high-risk decision:** choose a HEIC/HEIF decoder only after a
   Judge reviews licensing, bundled-WASM/native behavior, decode limits, and
   Windows plus Debian-slim Docker fixtures. Do not silently rely on Sharp's
   installed libheif variant.
3. **Separate model decision:** bundle OCR only after selecting a documented
   local model, its permitted redistribution/license, language coverage,
   storage location, CPU/memory/time limits, and deterministic low-confidence
   review behavior. Default network model retrieval is incompatible with this
   product.
4. **Separate archive boundary:** define one archive format and its explicit
   limits before accepting it; arbitrary archive support is not a safe
   extension of the current one-file API.

## Sources

- [Sharp constructor/input documentation](https://sharp.pixelplumbing.com/api-constructor/)
- [Sharp HEIF output documentation](https://sharp.pixelplumbing.com/api-output/)
- [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Tesseract.js language-data behavior](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md)
- [libheif-js package documentation](https://www.npmjs.com/package/libheif-js)
- [heic-convert package documentation](https://www.npmjs.com/package/heic-convert)
- [node-tar depth-validation advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-f5x3-32g6-xq36)
