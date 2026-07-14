# ADR 0005: Capture creates a draft, confirmation creates a recipe

Text and public-URL capture return an in-memory browser draft with provenance and original extracted text. They do not create a shared recipe, revision, image, or source record. The existing explicit recipe confirmation action is the only persistence step.

URL capture is server-only. It accepts public HTTP(S) targets without credentials, rejects private/reserved resolution results, rechecks redirect targets, caps redirects at three, sends no cookies, accepts text/HTML only, and enforces timeout and byte limits. Unit tests mock lookup and responses; no normal test performs an internet request.

This package does not handle uploads, images, handwriting, PDFs, OCR, archives, or AI normalization. Those require separate untrusted-file and provider controls.
