# T073 — post-portability release-gap audit

Date: 2026-07-13  
Decision: **not complete; select a safe, provider-independent AI-readiness
package before the required credential decision.**

## Updated acceptance evidence

| Original area | Current evidence | Status |
| --- | --- | --- |
| Household workflow, structured recipes, profiles, governance, search, cooking, planning, shopping, printing, PWA, API, recovery | Current local browser/accessibility/visual/print/10,000-row test matrix and prior receipts | Complete locally |
| Portable full recipe export | T072 deterministic JSON-LD/WebP tarball, checksums, active-profile/origin behavior, no-input boundary, browser download | Complete |
| Backup/restore | Existing isolated validation, safety backup, SQLite/media round trip | Complete locally |
| Public URL / text / PDF / printed-scan / pasted JSON-LD review | Existing deterministic review-first routes and local OCR evidence | Complete within their documented limits |
| HEIC/HEIF | T069 found no maintained safe Node 24 Windows + Debian-slim server route without an obsolete decoder, browser-only provenance gap, or custom HEVC toolchain/legal burden | Deferred honestly; still open |
| Handwriting OCR | T067 found a real handwriting model but no license-clear full-page/package/segmentation/fixture proof | Deferred honestly; still open |
| OpenAI integration | A safe environment check reports `OPENAI_API_KEY=absent`; there is no SDK/provider/callable configuration or deterministic provider seam | Open; direct OpenAI code remains subject to the required credential decision |
| Docker/Unraid runtime | Image/template/migration/smoke artifacts exist, but the Docker Linux daemon is unavailable in this workspace | External environment evidence still required |

## T074 selection: safe AI-readiness boundary

There is still a coherent local package that does **not** call or configure
OpenAI: establish the strict provider-independent AI operation contract and a
truthful disabled status surface. It will define the one review-only candidate
shape and error/status taxonomy needed by later text, vision, and image
operations; provide a deterministic in-test fake only; and expose that AI is
disabled because no credential/provider is configured. It must not add the
OpenAI SDK, read an API key, add an environment variable that enables calls,
invoke a network provider, or represent a mock as a household feature.

This makes the eventual credential-gated OpenAI implementation narrower and
testable without fabricating AI behavior. After T074, adding the official SDK,
configuration, concrete `OpenAiProvider`, or any live verification requires an
explicit operator credential decision. Docker proof still requires a running
daemon; HEIC and handwriting remain technical deferrals rather than work to
silently substitute.
