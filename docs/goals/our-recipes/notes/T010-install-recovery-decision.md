# T010: Dependency-install recovery decision

Task: `T010`
Kind: `judge`
Status: `current`

## Root-cause assessment

The evidence does not implicate `better-sqlite3`, Node 24, or the dependency graph. Both install attempts resolved the locked graph and extracted packages, then failed while pnpm 11.8.0 opened different package manifests inside the workspace linking tree: first `better-sqlite3`, then `playwright-core`. That change in failing package is consistent with a pnpm/Windows filesystem-linking failure or transient lock, not a native SQLite incompatibility.

The project’s `packageManager` field forces pnpm 11.8.0, while Corepack reports 11.12.0 as the newer available stable line. The smallest responsible recovery is to update only the project’s package-manager pin, delete only the generated workspace `node_modules` directory after verifying its absolute path, perform one clean frozen-lockfile installation, validate both the SQLite and Playwright modules load, then continue the full original foundation package. No package dependency or driver substitution is authorized.

## Recovery constraints

- Update `packageManager` from `pnpm@11.8.0` to `pnpm@11.12.0`; preserve the locked package versions.
- Remove only `C:\Users\Callum\Documents\Recipe\node_modules` after confirming it is the generated dependency directory under the intended workspace.
- Use one clean reinstall attempt under pnpm 11.12.0. If the same manifest-opening error repeats, leave truthful evidence and return to a Judge rather than retrying indefinitely.
- Do not remove global caches, alter antivirus/security policy, change the SQLite driver, reduce test gates, or use a Docker/OpenAI workaround.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: approved
  full_outcome_complete: false
  note: notes/T010-install-recovery-decision.md
  summary: "The failure is package-manager linking across unrelated packages; T011 updates pnpm, safely rebuilds workspace dependencies, and resumes the full foundation scope."
```
