# T066 — post-local-OCR gap audit

## Result: not complete

T065 completes a useful, locally verified **printed/legible English scan** OCR
assist. The import path now has a pinned package model, validated local model
path, bounded execution, source/model provenance, explicit review, manual
fallback, deterministic tests, a real printed-fixture smoke test, and static
Docker packaging. It does not send data to a CDN or provider.

That result cannot be promoted to the original handwriting requirement. The
selected runtime's own documentation warns that its configuration does not
meaningfully improve handwritten-text recognition, and T065 correctly avoids a
handwriting assertion. The original release oracle remains far from satisfied:
Docker/Unraid proof, credential-gated provider behavior, HEIC/HEIF, archive
handling, a handwriting-capable local model, and final release evidence all
remain open.

## Acceptance-evidence map

| Original area | Current evidence | Status |
| --- | --- | --- |
| Local English printed scan suggestion | T065 full local test suite, printed model smoke, review/provenance/migration, and static Docker model copy | Complete within its explicitly limited claim |
| Handwritten recipe OCR | T063's primary-source evidence rejects a handwriting-quality claim for the current runtime; no dedicated local model selected or tested | **Open** |
| PDF textless scan OCR | Intentionally manual; Tesseract.js PDF scope is unsuitable without a separate renderer boundary | Open, separate scope |
| HEIC/HEIF and archive intake | Deferred in T053 because their runtime/security constraints differ from OCR | Open, separate scopes |
| OpenAI/provider | No usable credential decision or approved live call; no callable provider boundary | Operator/credential-gated |
| Docker/Unraid | Static packaging exists but daemon/volume proof is unavailable | Environment-gated |
| Final release oracle | Multiple required product/evidence gaps remain | Not complete |

## Selected next task: T067

T067 is a read-only Scout decision for a **locally bundled handwriting-capable
English OCR model**. It must be materially stricter than T063: primary model
and license evidence, an offline package/bundle route, Node 24 Windows and
Debian-slim deployment fit, image/container resource implications, no-CDN
runtime enforcement, representative real-handwriting fixture methodology, and
an acceptance threshold that does not use a cursive font as a proxy. It may
approve a later Worker only when those facts are concrete; otherwise it must
defer the handwriting criterion honestly.

This is the largest remaining safe local discovery package. It neither expands
HEIC/archive/PDF-rendering scope nor accesses a provider credential or Docker.
