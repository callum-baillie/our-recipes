# 1.0.0-rc.19 publication

The user authorized a new GitHub release and container publication after the post-review work. This prerelease advances package, health, OpenAPI, provider identification and service-worker versions together. It does not merge the refinement branch into main or imply production deployment.

## Candidate and publication

The implementation at `e83e958552796e1fe1854f83d1fb0b698250fc20` passed [both clean CI jobs](https://github.com/callum-baillie/our-recipes/actions/runs/39507598781): 671 unit tests; 376 integration passes with9 optional historical-archive skips; 179 documented API operations; 19 release browser cases plus3 performance checks;22 post-review browser cases; native70 tests and both platform exports. Formatting, lint, types and the3,585-file release artifact passed. This is implementation evidence, not a substitute for the rc.19 candidate's own CI or image checks.

The version candidate must pass its own verification before tagging. Tag `v1.0.0-rc.19` invokes the existing release workflow, publishing `ghcr.io/callum-baillie/bord:v1.0.0-rc.19` and `latest` as a multi-platform manifest. Native amd64 and arm64 jobs then pull the published image and exercise non-root runtime, migrations, authenticated writes, persistent restart, backup creation/download/validation/restore, session revocation and interrupted-recovery guards with disposable data. Image build, runtime checks and deployment remain separate outcomes. The GitHub release and attached receipt record the exact tag commit, workflows and manifest digest after completion.

## Upgrade and rollback

Includes additive migrations0072/0073 (75 journal entries) through `0073_shopping_cart_units`. Create, download and validate a backup outside the app volume before upgrading, and retain the prior image digest. Preserve the dedicated `/data` mapping and configured secrets/origin. Require health version `1.0.0-rc.19`, current migrations and database integrity before accepting writes. Existing ambiguous cart units remain unknown and require review; no unit is inferred from text or recipe demand. Old email-verification links require a new request at `/verify-email`. Legacy unknown AI outcomes are not automatically replayed; old images without a reviewed revision require renewed review.

For rollback, use a fresh data directory restored using the compatible pre-upgrade archive and prior image. Changing the image does not undo migrations. See [deployment](../deployment.md) and [backup recovery](../backup-and-restore.md).

## Remaining limits

F01–F14 and G01–G03 have the scoped evidence in the [completion register](post-review.md); all33 earlier findings remain tracked. G04–G06 retain native/device acceptance; G07 needs explicit paid evaluation permission; G08 retains dependency and external checks. Root production audit was clean; the full root audit retained one high development advisory, and native retained22 high/8 moderate advisories. No supported compatible remediation was proved and no forced upgrade/suppression was applied.

Physical native/camera/SecureStore lifecycle, physical passkeys/live email/providers/source packs, installed PWA updates, paid model/image quality, production workers, real operator volumes and Unraid are not established by CI or disposable-container checks. No live household data, credentials, paid calls or source acquisition are part of publication. The [verification receipt](post-review-verification.md) and [dependency disposition](post-review-dependencies.md) retain exact scope and failed-run history.

The candidate also corrects the health/settings expected migration count from73 to75. A fresh-install regression reads the actual journal and asserts the reported package version, schema, expected/applied count and integrity through the real health/service boundary.
