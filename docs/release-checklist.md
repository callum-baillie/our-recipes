# V1 release checklist

Complete this checklist for the exact tag candidate. A prior run, source review, or test from a different commit is not release evidence.

## Automated oracle

- [ ] Frozen install succeeds on Node 24 and pnpm 11.
- [ ] `pnpm verify` passes without lint or OpenAPI warnings.
- [ ] `pnpm test:v1-release` passes and its integrated journey records no external provider traffic.
- [ ] `pnpm build:release` rejects tracing warnings and confirms the standalone denylist is empty.
- [ ] Fresh migrations and the last-beta upgrade/restore fixture pass.
- [ ] `pnpm audit --prod --audit-level=moderate` reports no unaccepted production advisory.

## Data and recovery

- [ ] Create, download, validate, and restore a populated backup into a fresh candidate instance.
- [ ] Compare recipes/revisions/photos, plans/pinned snapshots, Pantry batches/events, lists/intakes, prepared Nutrition, diary history, settings, and actor attribution.
- [ ] Exercise read-only storage, missing permissions, invalid origin, incomplete migration, corrupt database/backup, and disk-full recovery on the candidate host.
- [ ] Copy one verified backup outside the application data volume before upgrade.

## UI and distribution

- [ ] Desktop 1280/1440/1920, tablet 768, and mobile 320/390/430 have no unintended overflow.
- [ ] Keyboard, focus, dialogs, live regions, reduced motion, light/dark, console, and axe checks pass on the critical household loop.
- [ ] `pnpm test:docker` proves image build, clean layers, non-root runtime, health, migration, persistent restart, backup, and restore on the candidate engine.
- [ ] A real Unraid installation passes volume ownership, restart, upgrade, health, backup, and restore before Unraid is advertised as verified for this tag.
- [ ] Real iPhone Safari passes import selection/conversion, safe areas, keyboard/sticky UI, and warmed offline reading.
- [ ] Offline mutation attempts fail visibly and no write is queued or replayed.

## Release administration

- [ ] Version, release notes, capability matrix, checksums, image tags, and rollback instructions match the candidate.
- [ ] Security and support reporting links work.
- [ ] Known deferrals are explicit and none are P0/P1.
- [ ] No publish, push, tag, or image release occurs until every supported-target row has current evidence.
