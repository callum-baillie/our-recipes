# Release checklist

Every release criterion below has current local evidence. Deployment to a
specific household's Unraid host remains an operator action, not a test that
changes that host.

- [x] Fresh Docker build, health, first-run setup, and temporary bind-mounted persistence recreation pass on Docker Engine 29.6.1 (2026-07-13).
- [x] The Unraid template, Compose configuration, required persistent `/data` mapping, masked OpenAI variable, model settings, trusted-origin settings, and deployment documentation have been reviewed. The Docker bind-mount recreation test proves the required container persistence without modifying an Unraid host.
- [x] Local SQLite/media backup, manifest validation, pre-restore safety backup, and isolated restore round trip are proved.
- [x] Household onboarding, profile archive/restore, tag and collection governance, recipe capture/review/JSON-LD/Markdown portability, rich recipe metadata, profile-aware ratings/favorites, revision restore, multi-section recipe editing/revisions, lifecycle/faceted search, cooking, recipe/free-form planning, ICS export, ordered shopping-aisle groups, lists, and print workflows are proved together under the fresh local acceptance flow.
- [x] Warm-cache PWA recipe and local-image reading is proved; offline writes are explicitly unavailable.
- [x] URL/file/image/archive handling and external fetch defenses are tested. Public URL capture, local PDF/scan input, JSON-LD, server-generated archives, and real HEIC/HEIF browser conversion before the unchanged JPEG/PNG/WebP server gate have focused boundary tests. Handwritten-photo review is an explicit OpenAI vision action when configured; the bundled local OCR path remains an additional printed-text assist. Arbitrary archive import is intentionally unsupported.
- [x] The AI review contract is strict, explicit, server-only, rate-limited, content-audited, and covered with deterministic provider doubles. Paid live requests remain opt-in and unrun, as required by the automated-test policy.
- [x] Responsive desktop/tablet/mobile, system light/dark, and US Letter/A4 print checks pass; the Chromium matrix also runs axe against the dark library.
- [x] Current frozen-install, unit, integration, e2e, accessibility, release-quality, OpenAPI, type, lint, format, build, and diff checks pass.
- [x] Frozen production dependency audit is clean as of 2026-07-13; the narrow Next-to-PostCSS mitigation is documented in decision 0024 and must be rechecked for each release.
- [ ] The final Judge maps evidence to every original acceptance criterion.

Safe local recipe-image validation, processing, storage, browser proof, and server-generated portable export are complete. Document and pasted Schema.org JSON-LD portability flows are review-first and make no provider calls. Printed-English OCR is a local assist, while explicit configured OpenAI vision supplies reviewable handwritten-photo or scan extraction; neither path silently saves a recipe.
