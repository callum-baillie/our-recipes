# RC26 scanner and catalog reliability

Bòrd `1.0.0-rc.26` preserves schema `0082_scanner_stations` / 84 migrations and integrates the existing scan-list work with scanner connection recovery, bounded catalog read retries, explicit control acknowledgements and responsive station controls. Companion `0.2.1` is source commit `4d9df12`; install Bòrd first because the companion now requires identity-bound heartbeat replies.

## Verification

All 767 unit tests and 527 integration tests pass (9 existing skips). The full Bòrd unit and integration suites, TypeScript, formatting, lint, OpenAPI coverage/client smoke and standalone release artifact checks were run for this candidate. Existing warnings remain in the vendored PDF components and an unused OpenAPI schema. The companion passes 41 deterministic tests and Ruff lint/format; the built wheel was compared byte-for-byte with all source modules.

The T3 collaborative browser exercised a separate synthetic household on the built standalone app. A lost post-commit reply followed by reload/retry retained the original UUID and produced exactly one transaction. Remote IDLE was acknowledged; the page changed mode after companion confirmation. Injected status-fetch failure disabled remote controls, and recovery resumed status reads. The scan list displayed the live batch, saved a 500 g to 450 g correction and guarded removal. Scanner controls were inspected at 1440, 390 and 320 CSS pixels, including dark appearance; at 320 all visible station buttons measured 44px high and the document had no horizontal overflow. The HTTP fixture generated the expected browser COOP warning because the collaborative browser does not trust the LAN HTTPS certificate; no application error or framework overlay was observed.

The production dependency audit reports 20 existing advisories (1 critical, 7 high, 9 moderate, 3 low), affecting Better Auth and transitive adapters, Zod, Nodemailer and Undici. Dependencies and the pnpm lockfile are unchanged by this release. This is not a clean dependency-audit claim; dependency remediation remains separate work. The full general browser release oracle, native device checks and hardware scan/replug/reboot acceptance were not rerun.

## Deployment and rollback

Use the versioned rc.26 image rather than resolving a moving `latest` tag. Preserve the household data directory, companion environment and persistent queue. Save both stopped consistency sets outside their live directories before cutover. Start Bòrd and verify health/schema, then start companion 0.2.1 and verify its bound context, reader status and heartbeats. Perform only read-only catalog probes against the production household.

Rollback both service images together: companion 0.2.1 requires the rc.26 heartbeat contract. Keep the stopped pre-upgrade data and queue plus original Compose configuration. There is no new schema migration, but do not replace current household data with an older backup after new production writes without reconciling those writes and scanner receipts.

## Tower deployment evidence — 28 October 2026 UTC

The [published multi-architecture image and both container smoke checks](https://github.com/callum-baillie/our-recipes/actions/runs/40631606977) passed. Tower now runs `ghcr.io/callum-baillie/bord:v1.0.0-rc.26` (source `df238867`, image index `sha256:bcdb0df6c6b20316b5b29af8d02e5b01719227c82f18fba79f4ab3c1431fa13f`) and companion `bord-scanner-companion:0.2.1-4d9df12`.

A stopped application/queue backup is retained at `/mnt/cache/backups/bord/20261028-rc26`. All 123 application table fingerprints matched after Bòrd started; all 84 migrations remain current, integrity is `ok` and there are no foreign-key violations. Both completed scanner queue operations, exact intents/results and queue binding were preserved. Original service environments, mounts and device mappings match. Food API/assistance/history container IDs and start times are unchanged.

HTTPS health reports rc.26/current, Docker health is healthy and both services have zero restarts. The updated companion grabbed the USB reader and reports fresh ADD/add-only heartbeats with queue/review counts zero. Its handshake and an exact local USDA lookup with the configured Pantry destination return 200 and a catalog-add candidate; no production stock mutation was submitted. Physical scan, replug and reboot acceptance remain separate.

The separate hosted native-app job failed `npm run typecheck`; mobile source was unchanged. This is not a claim that every hosted CI job is green.
