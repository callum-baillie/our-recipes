# T012 — pnpm linker recovery decision

## Evidence assessed

- T005 and T011 both resolved and extracted the locked dependency graph, then failed while opening `package.json` files in different, unrelated packages during installation.
- Updating the project pin from pnpm 11.8.0 to 11.12.0 did not change that behavior.
- The repository lockfile remains intact and still records the selected dependency graph; neither failure is evidence against Node 24, `better-sqlite3`, or any individual package.
- The current project `.npmrc` contains project linker-adjacent settings, but current pnpm guidance places non-registry project configuration in `pnpm-workspace.yaml`. Its `auto-install-peers=false` also disagrees with the existing lockfile setting (`autoInstallPeers: true`).

## Decision

One conservative pnpm-only recovery remains: move project configuration to `pnpm-workspace.yaml`, use the documented `nodeLinker: hoisted` mode, and set `packageImportMethod: copy`. The hoisted linker avoids the isolated virtual-store symlink layout, while copy avoids link-based package import behavior. This changes only local installation mechanics; it preserves pnpm, the lockfile, exact dependency versions, Node 24, the SQLite decision, and every required quality gate.

T013 may update the project configuration, delete only the verified generated workspace `node_modules` directory, and make one clean frozen-lockfile installation attempt. It must not alter system security settings, retry the default linker, relax the lockfile, switch package managers or SQLite drivers, or touch user data. If that attempt repeats the manifest-opening failure, no further safe in-repository recovery remains. The operator must then investigate endpoint protection, file synchronization, or filesystem interception and retry from a known-good local working directory, copying source files only (never `node_modules`).

## Confidence and limits

Root-cause confidence is medium that the failure is Windows filesystem/link behavior or external filesystem interference rather than dependency resolution: the failing package changed across runs after extraction. The linker change is a bounded diagnostic and compatible production development configuration, not a claim that it fixes the underlying host issue.
