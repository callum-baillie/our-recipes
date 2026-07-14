# 0019 — pnpm linker recovery and Windows dependency evidence

- Status: accepted
- Date: 2026-07-13

## Context

An earlier foundation receipt (T005) reported Windows package-manifest opens
failing after resolution and extraction, first for `better-sqlite3` and then
for `playwright-core`. That receipt does not retain the complete original
terminal error or its absolute filesystem path, so it cannot support a new
root-cause claim on its own. This recovery pass therefore treats the current
workspace as authoritative and captures a fresh install before changing any
dependency state.

## Exact current capture

Before any configuration or dependency-state change, this command ran from
the workspace root:

```text
pnpm install --frozen-lockfile --reporter=append-only
```

Its complete output and exit status were:

```text
Already up to date
Done in 913ms using pnpm v11.12.0
PNPM_EXIT_CODE=0
```

There was no current failure. Accordingly, the failing package, filesystem
path, and operation phase are all **not applicable** for this capture: it did
not fail during extraction, hardlink creation, symlink creation, bin linking,
postinstall, or workspace resolution. It would be misleading to attribute the
historical symptom to pnpm, the linker, or the SQLite driver without a current
reproduction.

## Current workspace configuration

| Concern            | Current evidence                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager    | `package.json` pins `pnpm@11.12.0`; runtime pnpm and Corepack-selected pnpm are both `11.12.0`.                                                                                             |
| Node               | `package.json` requires `>=24 <25`; current runtime is `v24.17.0`. There is no `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`, or Volta file.                                     |
| Corepack           | Corepack is available at `0.35.0`; CI enables it before installation.                                                                                                                       |
| Workspace          | `pnpm-workspace.yaml` declares one package (`.`). No `workspace:` protocol references exist in the manifest or lockfile.                                                                    |
| Linker/import mode | The workspace config already sets `nodeLinker: hoisted` and `packageImportMethod: copy`. pnpm reports both `node-linker` and `package-import-method` as `hoisted` and `copy`, respectively. |
| Hoisting           | No `hoist-pattern`, `public-hoist-pattern`, or `shamefully-hoist` value is set.                                                                                                             |
| Build approvals    | The workspace permits native build scripts for `better-sqlite3`, `esbuild`, `sharp`, and `unrs-resolver`.                                                                                   |
| Project `.npmrc`   | Contains only the registry-credential comment; project pnpm settings correctly live in `pnpm-workspace.yaml`.                                                                               |
| Lockfile           | `pnpm-lock.yaml` is lockfile format `9.0` and the frozen install completed without modification.                                                                                            |
| CI                 | GitHub Actions uses Ubuntu, Node 24, Corepack, frozen pnpm install, all quality gates, and the production build.                                                                            |

## Decision and recovery result

Keep the existing `hoisted` + `copy` configuration. It already implements the
requested conservative Windows-compatible linker mode, without moving
project-level pnpm settings into `.npmrc`.

Do **not** remove `node_modules`, a local `.pnpm` directory, or pnpm metadata
in this pass. A successful frozen install means that cleanup would be a
speculative destructive step with no demonstrated dependency-state corruption
to recover. No source, manifest, lockfile, application, package-manager, or
driver change is authorized by the evidence.

## SQLite driver investigation

The selected driver remains `better-sqlite3@12.11.1`. It is a native module,
so an actual Windows installation failure could originate in its build or
binary-load path; the successful frozen install alone would not establish that
failure. The following native-load probe passed on this Windows environment:

```text
node -e '<create an in-memory better-sqlite3 database, insert 1, and query it>'
better-sqlite3 in-memory query: 1
```

`pnpm -r list`, `pnpm -r exec node --version`, and `pnpm build` also passed.
The build completed with the pre-existing non-fatal backup-route Turbopack
file-trace warning. This proves the installed native binding is usable with
the pinned Node 24 runtime and the current production build. No alternative
driver evaluation or change is warranted. The locked deployment stack remains
SQLite with Drizzle ORM and pnpm.

An additional full-repository `pnpm format:check` reports formatting in
`src/lib/domain/planning.ts`. That file belongs to the interrupted planning
package, not to dependency recovery, and it does not alter the successful
installation, driver, or build evidence. Product continuation must handle it
in a task whose allowed scope includes the planning source and its associated
browser verification.

## Dependency Recovery

- **Original failure:** T005 historically reported package-manifest open
  failures involving `better-sqlite3` and `playwright-core`; the original full
  output/path was not retained.
- **Diagnosis:** the current, unmodified frozen install is healthy under Node
  24.17.0, pnpm 11.12.0, Corepack 0.35.0, a hoisted linker, and copy imports.
- **Attempted fixes:** no new linker switch or cleanup was applied because the
  workspace already has the required conservative configuration and no current
  failure reproduced.
- **Final resolution:** retain the established configuration; frozen install,
  recursive package/runtime checks, the native SQLite probe, and the production
  build all pass. Docker verification was not run because Windows dependencies
  are currently reliable, so the conditional Docker fallback is not triggered.
- **Files changed:** this decision record only.
- **Developer workflow:** use Corepack with the pinned package-manager version
  and run `pnpm install --frozen-lockfile`; if a new Windows failure reproduces,
  preserve its full output, package, absolute path, and phase before removing
  only generated dependency state and retrying with the already-configured
  hoisted linker. Use the Docker workflow only if that evidence persists after
  the conservative retry.
