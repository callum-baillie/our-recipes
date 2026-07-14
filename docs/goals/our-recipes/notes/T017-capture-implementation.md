# T017 — review-first capture implementation receipt

## Delivered

- Pasted recipe text and public URLs now create an in-memory structured review draft with original extracted text and provenance. No draft endpoint writes a recipe.
- The confirmation action reuses the recipe form and is explicitly labeled “Confirm and add to cookbook”; it is the only capture-to-recipe persistence path.
- URL fetching is server-only and bounded by scheme/credential validation, DNS private/reserved-address rejection, redirect revalidation/cap, no cookies, text/HTML allow-list, timeout, and byte limits.
- Unit tests mock DNS and fetch to prove private-address rejection, HTML extraction, and redirect defense. Browser proof uses pasted text and review confirmation.

## Verification

Frozen install, formatting, lint, strict typing, eleven unit tests, four SQLite integration tests, Chromium workflow, axe, OpenAPI validation, production build, and diff check pass. OpenAPI’s existing metadata recommendations remain non-blocking.

## Remaining gaps

File/image/PDF/handwriting capture/OCR, image processing, PWA, backups/restores, Docker/Unraid, and final release proof remain distinct packages.
