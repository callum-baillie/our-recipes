# T077 — approved provider, HEIC/HEIF, and Docker delivery decision

Date: 2026-07-13  
Decision: **approve one coherent implementation and deployment-validation
package, T078.**

## Operator authority now available

- The operator explicitly chose to reuse the existing `OPENAI_API_KEY` in the
  ignored project-root `.api_keys` file. Its content was not read, displayed,
  committed, or used for a request during this decision.
- Docker Desktop's Linux daemon is available and the operator approved local
  build, health, and bind-mounted persistence validation.
- HEIC/HEIF must use browser-side conversion, not a server codec toolchain.
- A paid live OpenAI request is **not** approved. Implementation must use
  deterministic provider doubles; production requests require an intentional
  household action after deployment.

## Selected design

### OpenAI

T078 will add the official `openai` JavaScript SDK and a server-only
`OpenAiProvider`. It will use the Responses API with strict Structured Outputs
for text normalization and vision recipe extraction; the current official guide
demonstrates `responses.parse` with `zodTextFormat`. It will use the official
image-generation Responses tool only behind an explicit user action, then
normalize and store its output through the existing local image pipeline.

The provider must accept only bounded server-side source text or existing
normalized import artifacts. It must treat every source as untrusted recipe
content, never persist a candidate without confirmation, rate-limit requests,
return safe failures, and retain an audit record without raw source text,
credentials, or generated provider URLs. The production status surface may
report only configured/unconfigured and supported operations; it must never
reveal a key, model secret, or feature content.

The local `.api_keys` convenience path is development-only. Production reads
`OPENAI_API_KEY` exclusively from the runtime environment. `.api_keys` must be
excluded explicitly from the Docker build context and never copied into an
image, backup, response, browser bundle, log, or test output.

### HEIC/HEIF

T078 will use `@discourse/heic@1.0.0`, a current browser WASM decoder with
TypeScript declarations and Apache-2.0 package metadata. It avoids the
LGPL-3.0 `heic-to` alternative and the unsupported server HEVC toolchain.
Client components will turn eligible HEIC/HEIF selections into an in-memory JPEG
before constructing `FormData`; the original file never crosses the network or
reaches storage. The existing server byte-derived JPEG/PNG/WebP gate remains
unchanged. The UI will disclose that conversion happened locally, show errors
without uploading partial data, retain the original source name as untrusted
review provenance for document imports, and let the user remove/reselect files.

The package must prove browser conversion with an actual license-clear HEIC/HEIF
fixture or, if a decoder package cannot support both requested container types
with such a fixture, stop and return an evidence-backed decision rather than
claiming generic support.

### Docker

After code verification, T078 will run the existing daemon-backed
`pnpm test:docker`. It builds the image, verifies health, performs first-run
setup, recreates the container with the same temporary bind mount, and proves
the setup persists. It may remove only its named temporary container/image and
temporary directory. No registry publishing or host-Unraid mutation is allowed.

## T078 scope

T078 is the largest coherent safe package because provider review, browser
conversion, input/storage boundaries, configuration, audit metadata, user
consent, documentation, and Docker validation jointly determine whether these
three acceptance criteria are true. It deliberately excludes a paid live call;
that remains a separately approved release-evidence action.

## Evidence consulted

- The official OpenAI Structured Outputs guide documents `responses.parse` and
  `zodTextFormat`; the Images and vision guide documents Responses image input
  and the image-generation tool.
- `pnpm view openai version` reports `6.46.0`.
- `pnpm view @discourse/heic@1.0.0` reports Apache-2.0, browser HEIC decoding,
  TypeScript declarations, and an approximately 1 MB unpacked package.
- T069 rejects the prior Windows/Linux server-decoder candidates and records why
  byte validation must not be weakened.
