# T070 — archive and portable-export decision

Date: 2026-07-13  
Scope: read-only research. No package installation, archive creation or
extraction, user-file processing, code/configuration/data modification,
provider/credential access, or Docker run was performed.

## Decision: do not add uploaded archive intake

The supplied product specification requires two archive-shaped capabilities:

1. application-generated, validated full backups and restores; and
2. a **portable full recipe export containing JSON-LD and images**.

It does not require importing arbitrary user-uploaded ZIP/TAR files. The
existing backup system already supplies the first capability with a server-only
tar.gz format, path/type/size validation, isolated staging, checksum/SQLite
checks, and no arbitrary upload. Adding an archive-import endpoint would expand
the attack surface without satisfying a stated acceptance criterion.

The correct future product slice is therefore a server-generated portable
recipe export, not uploaded archive intake. Use the already pinned, current
`tar@7.5.20` to produce a deterministic `.tar.gz` from a private staging
directory. It needs no new archive parser or package. First resolve the
separate current production dependency advisory described below; then implement
the portable export as the next product Worker.

## Current archive evidence

| Area | Finding | Decision |
| --- | --- | --- |
| Backup/restore | The existing `tar@7.5.20` service creates server-only `.tar.gz` bundles and validates every listed bundle before isolated extraction. It permits only explicit paths, regular files/directories, fixed byte caps, checksums and SQLite integrity. | Complete for recovery; retain the no-arbitrary-upload rule. |
| `tar@7.5.20` | Current registry metadata reports Node >=18, BlueOak-1.0.0, and this exact version is the current package release. The library documents hardened archive handling but still requires callers to reject links, limit expanded sizes, and avoid extraction into attacker-controlled directories. | Approved for **creation of app-generated output only**. Do not use it to accept user archives. |
| ZIP candidates (`yauzl`, `yazl`, `unzipper`, `adm-zip`) | ZIP adds a new dependency/API surface while the requested portable format is not specified as ZIP. An uploaded ZIP would require its own ratio/path/link/entry validation and does not improve the required export. | Reject for this release slice. |
| Existing JSON-LD export | Recipe detail already produces deterministic Schema.org Recipe JSON-LD and Markdown downloads, but it omits local media and does not provide the required full portable export. | Extend through an app-generated aggregate archive; do not widen JSON-LD paste import. |

## Portable export contract for the future Worker

- The export endpoint must require the ordinary active-profile/trusted local
  application context, be `no-store` and `nosniff`, and stream/download one
  application-created `.tar.gz`; it must never receive archive bytes.
- Build a temporary directory outside the durable `uploads`/`generated` roots,
  generate deterministic per-recipe Schema.org JSON-LD files, and copy only
  existing regular normalized WebP files referenced by the exported recipe
  set. Generate stable archive-relative names from recipe/image IDs or hashes,
  never a user filename or storage path.
- Include a compact export manifest with format/version/date, recipe-to-JSON-LD
  mapping, local-media mapping, file byte lengths and SHA-256 checksums. Exclude
  household/profile identifiers, selection cookies, personal ratings/notes,
  revision snapshots, imports/OCR provenance, storage keys/absolute paths,
  backups, environment/configuration secrets, and non-exported files.
- Reject a non-regular or missing media source; do not follow symlinks. Cap
  total recipe/media count and uncompressed archive bytes at a documented
  export limit that still covers the 10,000-recipe performance target, clean up
  temporary output on success/failure, and avoid buffering the archive in
  application memory.
- Test archive entries, determinism, JSON-LD validity, media checksums,
  duplicate-media behavior, private-field exclusion, missing/symlink rejection,
  size-limit failure, and one browser download. The output is intentionally
  export-only: it is not accepted back as a file or archive import.

## Security finding that must be handled first

`pnpm audit --prod --audit-level=low --json` currently reports one moderate
production advisory: `postcss@8.4.31` nested under `next@16.2.10`
(`GHSA-qx2v-qp2m-jg93`, patched in PostCSS >=8.5.10). `pnpm why postcss`
confirms the application also has a separate patched `8.5.17` copy through
Tailwind/Vitest. The current stable Next release still specifies 8.4.31, while
the linked Next discussion documents a targeted package-manager override as
the temporary mitigation.

This is independent of the archive design. It must be fixed and verified with
the documented frozen pnpm recovery configuration before another feature
package changes the lockfile.

## Next tasks

1. **T071 Worker — remediate the nested PostCSS advisory:** add the narrow
   pnpm override for Next's PostCSS child only, refresh/freeze the lockfile,
   verify the audit is clean and all existing quality gates remain green. Do
   not change Next, Node, the package manager, or application code.
2. **T072 Worker — server-generated portable recipe archive:** after T071,
   implement the export-only contract above using the existing tar runtime.

## Sources

- [User-supplied product specification: portable full recipe export and backup/restore requirements](C:/Users/Callum/.codex/attachments/6865c690-aa79-4659-9ffc-48effe1771ab/pasted-text.txt)
- [node-tar security guidance and API](https://www.npmjs.com/package/tar)
- [node-tar advisory fixed before the pinned version](https://github.com/isaacs/node-tar/security/advisories/GHSA-29xp-372q-xqph)
- [PostCSS advisory](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [Next.js issue documenting the nested PostCSS mitigation](https://github.com/vercel/next.js/issues/93604)
