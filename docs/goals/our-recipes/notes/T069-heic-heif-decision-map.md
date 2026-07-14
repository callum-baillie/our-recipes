# T069 — HEIC/HEIF intake decision map

Date: 2026-07-13  
Scope: read-only research. No package installation, image/model download or
processing, code/configuration/data modification, provider/credential access,
or Docker run was performed.

## Decision: defer HEIC/HEIF implementation

No currently evidenced candidate provides a maintainable, server-side, local
HEIC route that satisfies both Node 24 Windows development and the
Debian-slim/Unraid deployment target without introducing either an unpatched
decoder, a browser-only conversion/provenance gap, or a custom HEVC toolchain
and patent burden.

Keep the current byte-derived rejection of HEIC/HEIF. Do not add a filename or
MIME bypass. JPEG/PNG/WebP import remains the safe, normalized local path. This
does not block independent archive, provider, or deployment work; it leaves the
original HEIC/HEIF requirement explicit and open.

## Current environment facts

| Area | Finding | Consequence |
| --- | --- | --- |
| Installed image stack | `sharp@0.35.3` on this Windows Node 24 workspace reports libvips 8.18.3 and libheif 1.23.0. `sharp.format.heif` accepts buffer/file/stream input but lists only `.avif` as a supported suffix. | A generic HEIF loader exists, but this does **not** prove HEVC/HEIC decode support. The application correctly continues to reject HEIF before Sharp is called. |
| Sharp prebuilt binaries | Sharp's maintainer documents that prebuilt binaries do not include the patent-encumbered HEVC decoder/encoder. The current project uses normal prebuilt Sharp packages, including in Docker. | Typical iPhone HEIC cannot be claimed to work on the present Windows or default Debian-slim build. |
| Upstream codec architecture | libheif supports HEIC only when built with an HEVC decoder such as libde265 or FFmpeg; codecs can be static or dynamically loaded plugins. It is LGPL, and HEVC/x265 has additional patent/GPL considerations. | A custom libvips/libheif build is a separate production toolchain and legal/deployment decision, not a safe one-package change. It also fails the required Windows proof today. |

## Candidate comparison

| Candidate | Runtime and maintenance evidence | License/security/deployment evidence | Decision |
| --- | --- | --- | --- |
| Existing Sharp/libvips prebuild | Already pinned and successfully normalizes accepted formats. Generic HEIF input is advertised. | Sharp's own maintainer says prebuilds omit HEVC. The local runtime's `.avif`-only suffix is consistent with that limitation. | **Reject as a HEIC solution.** Do not remove the type gate. |
| `heic-decode@2.1.0` / `heic-convert@2.1.0` | Node-facing wrapper; `heic-decode` calls a libheif JavaScript build and warns that multi-image decoding must be disposed to prevent retained memory. | It resolves `libheif-js@1.19.8` (LGPL-3.0). The vendor reports libheif versions below 1.22.0 affected by CVE-2026-32738; 1.19.8 is therefore outside the fixed range. | **Reject.** A bounded upload path must not add an obsolete image decoder. |
| `heic-to@1.5.2` | Current May-2026 release bundles libheif 1.22.2 and tracks upstream releases. Its package is about 24.4 MB unpacked. | Documented only for browser `Blob`/`ImageBitmap`/worker conversion; it is LGPL-3.0. It does not establish a Node server decoder, an immutable original-file/hash path, or a reviewable API flow. | **Reject for this server-side import package.** A future client-side conversion design would be a different feature with provenance and trust boundaries to solve. |
| `@discourse/heic@1.0.0` | Current Apache-2.0 WASM package, published May 2026. The public package description says it decodes iPhone HEIC to `ImageData` in the browser. | No Node server, decoder-version, input-limit, or production Docker evidence was found. | **Defer/reject.** It is not a documented server-side replacement. |
| Custom libvips/libheif/libde265 build | Technically possible through libheif's configurable codec builds. | Requires a maintained source-build and CVE update process, explicit HEVC patent/legal review, Linux plugin shipping, and a separate Windows toolchain. | **Reject for this product release without a dedicated operations/legal decision.** |

## Security and provenance implications

HEIF is more than a filename extension: libheif supports multiple images,
sequences, auxiliary images, tiled images, depth maps, metadata and several
codecs. A future implementation must not use a permissive decoder result as
format validation. It would need all of the following before a Worker can be
approved:

1. Exact byte-brand admission for the supported HEIF subset, with no extension
   or browser MIME trust; reject sequences, multiple primary images, depth and
   auxiliary content unless each is explicitly designed and bounded.
2. A decoder version with current security fixes, fixed package integrity and
   full artifact provenance; a maintained, published CVE patch route is
   required. Never set libheif's security-limit override.
3. Pre-decode byte and dimension/pixel/frame limits, one bounded primary image,
   a deadline, and isolated conversion to a normal JPEG/PNG buffer before the
   existing Sharp pixel/metadata/WebP normalization. Raw RGBA buffers can be
   materially larger than a small HEIC file, so the current upload-byte cap
   alone is insufficient.
4. Original source bytes hashed and preserved through the same opaque,
   import-scoped artifact/provenance path, while the normalized WebP becomes
   the preview/OCR input. No filename is a filesystem path, no EXIF survives,
   no remote URL/CDN/worker download is allowed, and explicit confirmation
   remains the only recipe write.
5. Real, licensed/consented HEIC fixtures from at least two representative
   producers and both Windows Node 24 plus outbound-disabled Debian-slim
   container acceptance. Include malformed brand, excessive dimensions,
   multi-image/sequence, unsupported codec, malformed metadata, timeout and
   memory-limit fixtures. A rendered JPEG renamed `.heic` is not evidence.

These safeguards are a future design contract, not evidence that the present
implementation has them.

## Exact next-task recommendation

Do **not** activate a HEIC Worker. Select the independent uploaded-archive
boundary next: a focused Scout must establish whether one secure, useful archive
format can be accepted without reusing the server-created backup extractor or
weakening archive traversal/resource controls. The handwriting and HEIC criteria
remain deferred; they must not be re-labelled complete because the product
supports local JPEG/PNG/WebP scan sets.

## Sources

- [Sharp input metadata (HEIF compression field)](https://sharp.pixelplumbing.com/api-input/)
- [Sharp HEIF output and HEVC build requirement](https://sharp.pixelplumbing.com/api-output/)
- [Sharp maintainer: prebuilt binaries omit HEVC](https://github.com/lovell/sharp/issues/2377)
- [libheif official README: codecs, plugin model, security limits and LGPL](https://github.com/strukturag/libheif)
- [heic-decode resource-disposal documentation](https://github.com/catdad-experiments/heic-decode)
- [libheif-js Node/WASM variants and LGPL metadata](https://www.npmjs.com/package/libheif-js)
- [libheif <1.22.0 vulnerability record](https://nvd.nist.gov/vuln/detail/CVE-2026-32738)
- [heic-to 1.5.2 browser documentation and libheif version](https://github.com/hoppergee/heic-to)
