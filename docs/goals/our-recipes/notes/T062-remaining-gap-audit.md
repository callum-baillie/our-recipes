# T062 — Post-local-acceptance gap audit

## Result: not complete

T061 closes the local combined-workflow release item. A new empty household can
complete the supported local journey through governance, capture/import and
portability, recipe evolution, cooking, planning/shopping, offline reading,
and backup validation; the current browser, accessibility, visual/print, scale,
and non-browser gates are also green.

## Remaining original outcome gaps

| Gap | Status | Next action |
| --- | --- | --- |
| Locally bundled handwriting OCR | Not implemented. T053 found Tesseract defaults to model download and handwriting quality/package deployment were unproven. | Select T063 to produce a current, concrete offline-English model/runtime/license/resource decision before any install. |
| HEIC/HEIF and archive intake | Intentionally unavailable. T053 documented decoder licensing/runtime and archive threat-boundary uncertainty. | Keep separate from OCR and defer until its own decision package. |
| OpenAI provider | No OpenAI SDK/provider/mock boundary. The required shell key check found no usable key, and a callable configuration requires the user’s credential decision; a live call additionally needs paid-call approval. | Operator/credential-gated. Do not implement a callable path now. |
| Docker/Unraid runtime | Image/configuration and smoke script exist, but Docker Desktop Linux engine remains unavailable, so no build/health/persistence/host proof exists. | Requires a daemon and mounted-volume operator environment. |
| Final release oracle | Cannot be met until the above capabilities/evidence are resolved. | Final audit remains premature. |

## Selected package: T063

T063 is a focused read-only investigation for **locally bundled English OCR of
household scans**. It must turn T053’s general finding into an implementable
or explicitly rejected decision: maintained Tesseract runtime/model packages,
redistribution licensing, Node 24/Windows/Debian-slim compatibility, all-local
model path, package/image size, worker/process boundary, page/pixel/text/CPU
limits, low-confidence/manual-review semantics, and deterministic fixture/test
strategy. It must use current primary sources and local package metadata only;
it may not install, download models, call providers, or modify product code.

OCR is selected because it advances the handwritten-recipe objective without a
credential or Docker daemon. It must not be conflated with HEIC/HEIF or archive
intake, each of which has a different security and runtime boundary.
