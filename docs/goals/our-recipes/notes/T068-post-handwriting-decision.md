# T068 — post-handwriting decision

## Decision: defer the handwriting implementation; research HEIC/HEIF next

T067 establishes that TrOCR is genuinely trained for handwriting, but it does
not establish a shippable **recipe-page** feature. The official TrOCR cards
limit raw use to a single text line; current JavaScript ONNX artifacts lack a
clear artifact license or a tested immutable deployment route. A Worker would
therefore have to invent both document layout/line segmentation and artifact
provenance while adding a large native inference runtime. That is not a bounded
implementation package and must not be disguised as completion of the
handwriting requirement.

Keep handwriting OCR deferred. A later implementation may proceed only after a
license-clear, full-page pathway (or independently proven segmentation) has
real-handwriting fixtures, offline runtime proof, and Docker evidence.

The next safe completion package is a **read-only HEIC/HEIF decoder Scout**.
HEIC is an independent, user-facing import gap in the original file-image
requirement and has a concrete Node 24/Windows/Debian-slim compatibility,
license, binary/WASM, resource-limit, and fixture question. It can produce a
precise Worker contract without touching the model, archive, provider, or
Docker gates.

## Acceptance-evidence map

| Area | Current state | Decision |
| --- | --- | --- |
| Printed/legible scan OCR | Locally packaged, review-only Tesseract route with Windows smoke and static Docker asset proof | Complete within its limited claim |
| Handwritten recipe scans | TrOCR gives a true handwriting candidate, but only for a line; artifact licensing, page segmentation, runtime/resource, and representative evidence are absent | **Deferred; not a Worker** |
| HEIC/HEIF image intake | Existing type gate deliberately rejects it. T053 records inconclusive Sharp/libheif support and nontrivial decoder licensing/runtime risk | Select focused Scout T069 |
| Uploaded archive intake | No arbitrary archive is accepted; backup archives remain server-created and separately protected | Open, separate boundary |
| OpenAI/provider | Credential and explicit paid-call approval remain absent | Operator/approval-gated |
| Docker/Unraid runtime/persistence | Static artifacts exist; the local daemon remains unavailable | Environment-gated |

## T069 contract

T069 must be read-only and use current primary package/runtime documentation
plus local metadata to compare: the installed Sharp/libvips/libheif route,
maintained Node-compatible HEIC decoders, and their exact license and binary or
WASM behavior. It must require byte-derived HEIF admission, strict decode
pixel/frame/time/memory bounds, local-only behavior, normalized WebP output,
no user filename/path propagation, Windows Node 24 and Debian-slim/Unraid
support evidence, real HEIC fixture provenance, and review-first confirmation.

It must either select one exact compatible decoder/package and a bounded Worker
with frozen provenance, or defer HEIC honestly. It must not install packages,
download user images/models, alter code, expand archive/PDF/OCR/provider scope,
or run Docker.
