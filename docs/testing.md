# Testing strategy

`pnpm test:unit` validates pure input, signed-cookie, capture, byte-derived import boundaries (including raw HEIC rejection), local-OCR guardrails, URL/JSON-LD boundaries, recipe behavior, and deterministic OpenAI SDK request shaping. `pnpm test:integration` uses isolated SQLite/data directories to prove household, import, export, media, backup, and AI-operation behavior: provider doubles receive only bounded text or normalized scan data; content-free audit rows and locally normalized generated images are verified without an external request. `pnpm test:ocr:smoke` runs only the packaged local-model printed-English fixture and does not assert handwriting recognition. `pnpm test:e2e` is the fresh-household local acceptance flow, including real HEIC and HEIF fixture conversion in Chromium before the existing server import gate. `pnpm test:a11y` and `pnpm test:release-quality` cover the established accessibility, responsive, color-scheme, print, and library-performance matrix.

Before a release or dependency update, run `pnpm audit --prod --audit-level=moderate` in addition to the ordinary frozen install and quality gates. The current workspace uses the documented narrow Next-to-PostCSS override in decision 0024; audit evidence must show no production advisory rather than merely an accepted warning.

The Playwright preparation script deletes only the generated `.test-data` directory before starting the test server. It does not touch the normal `data` directory. CI must install a compatible Playwright browser image before browser tests; normal code tests do not call external AI services.

AI coverage verifies the all-required Structured Outputs contract, configured/unconfigured safe status, explicit confirmation, bounded review/image inputs, rate limit, no-raw-content audit, and deterministic provider behavior. Browser coverage proves HEIC/HEIF conversion and the non-secret status/settings surface. No automated path makes a paid OpenAI request.

Run `pnpm test:docker` to build the image and prove health plus setup persistence across recreation of a temporary bind-mounted volume. It does not publish an image, modify an Unraid host, or read `.api_keys` because Docker build context excludes it.

Run the full application gate with:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:a11y
pnpm test:release-quality
pnpm openapi:validate
pnpm build
git diff --check
```
