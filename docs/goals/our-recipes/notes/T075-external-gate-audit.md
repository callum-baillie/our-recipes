# T075 — external-gate audit after safe local completion

Date: 2026-07-13  
Decision: **the original release outcome is not complete, and no further safe
local Worker is available without an operator decision or environment change.**

## Current result

The locally executable product surface is current and green: household/setup,
recipe editing and revisions, imports/review, structured URL capture, printed
scan OCR, images, cooking, planning, shopping, PWA reading, backup/restore,
portable JSON-LD/WebP export, accessibility, responsive/print/performance
checks, production build, frozen dependency audit, and the disabled AI
readiness boundary all have passing evidence.

This does not meet the full original release oracle. The following criteria
remain distinct and must not be relabelled complete:

| Requirement | Current evidence | What is required next |
| --- | --- | --- |
| OpenAI structured normalization, vision extraction, and image generation | Strict disabled provider contract only; safe check reports `OPENAI_API_KEY=absent`; no SDK/provider/network code exists | Operator credential decision before a concrete SDK/provider package; explicit approval before any paid live request |
| Handwritten recipe through OpenAI vision | Printed-only local OCR is proven; T067 deferred local handwriting because it lacks a license-clear whole-page model/segmentation/fixture path | The credential-gated vision route can address this requirement after the provider decision, or a new independently evidenced local full-page model route |
| Common iPhone HEIC/HEIF import | T069 found no maintained safe Node 24 Windows + Debian-slim server decoder candidate | An operator/product decision for a privacy/provenance-safe client conversion or a separately maintained/legal-reviewed codec toolchain |
| Docker/Unraid production proof | Dockerfile/template/smoke script exist, but this audit's fresh check fails because `dockerDesktopLinuxEngine` is unavailable | Start Docker Desktop/Linux Engine or provide access to the intended Unraid/Docker host, then authorize `pnpm test:docker` and the documented mounted-volume proof |

## No safe local substitute

The original credential gate forbids implementing/configuring/testing code that
calls OpenAI before the credential decision. The Docker oracle needs a daemon.
The researched HEIC and full-page local handwriting substitutions would either
weaken security/provenance or introduce unsupported licensing/runtime claims.
There is no remaining non-provider, non-Docker, non-decoder/model feature that
can close those criteria honestly.

## Exact continuation inputs

1. State whether to provision/reuse an OpenAI key securely for the next
   concrete provider package. This authorizes implementation/configuration only;
   it does **not** authorize a paid live request.
2. Make a Docker daemon (or the intended Unraid host) available for local
   build/health/persistence proof, then authorize that local validation.
3. Choose whether to pursue the separately documented HEIC client-conversion
   design or authorize a dedicated codec/legal/operations decision. The current
   safe behavior continues to reject HEIC/HEIF rather than claiming support.
