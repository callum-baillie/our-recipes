# T018 — local recipe image package decision

## Ranked remaining gaps

1. **Local recipe images:** the household can now create, capture, plan, shop for, and cook recipes, but cannot safely retain a photographed recipe or a recipe cover. This is the largest unblocked everyday-use gap and establishes the storage boundary that later photo/PDF imports can reuse.
2. **PDF and handwriting import:** important capture paths, but they need separate archive/document validation, page/raster limits, OCR/parser behavior, and review rules. They must not be smuggled into an image-media package.
3. **PWA read-only cache:** valuable once core read paths have the final media semantics, but needs a dedicated offline/versioning and browser-storage proof package.
4. **Backup/restore and Docker/Unraid:** release-critical operator work. Docker daemon and an Unraid-like mounted-volume environment are not currently available, so no deployment claim is justified.
5. **Final quality/release audit:** depends on the preceding features and operator evidence.

## Decision

T019 should implement local recipe image media only: a household member can add, view, and remove locally stored recipe images through a bounded server-side pipeline. It must accept only JPEG, PNG, and WebP files below a documented byte limit; verify file signatures before decoding; reject excessive image dimensions; strip/normalize metadata through an oriented, size-bounded WebP transform; use opaque generated storage keys inside `DATA_DIR`; record recipe/profile attribution and dimensions; and never treat a client filename, content type, or path as trusted.

The UI must expose the resulting media in the existing recipe workflow, and automated tests must exercise invalid inputs and a valid upload without external requests. It must not add OCR, PDF, archive extraction, remote fetches, AI calls, PWA caching, Docker packaging, or claims of deployment/backup proof.
