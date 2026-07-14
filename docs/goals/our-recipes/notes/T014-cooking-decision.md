# T014 — cooking workflow decision

## Ranked remaining gaps

1. **Cooking execution:** shared recipes, plans, and lists now exist, but there is no focused at-the-stove experience, scaling, timers, per-profile cooking history, or favorites.
2. **Review-first capture/import:** high value but requires a dedicated hardened boundary for remote URLs, files, images, PDFs, handwriting, provenance, quotas, and explicit review before persistence.
3. **Images and PWA:** require server-side image pipeline and bundler-compatible cache proof.
4. **Backup/restore and Docker/Unraid:** need direct operational verification and cannot be claimed before a daemon is available.

## Decision

T015 should implement a complete cooking workflow: a profile can choose a recipe, scale numeric ingredients to a target serving count, use a distraction-free step view, run multiple local timers, mark completion, favorite a recipe, and retain profile-specific cook history. It should preserve original recipe quantities, offer explicitly labeled simple temperature conversion where safe, and never change shared recipe content while cooking.

Capture/import remains the next major trust-boundary package; no remote fetch, upload, AI provider, image processing, PWA, or Docker work is authorized in T015.
