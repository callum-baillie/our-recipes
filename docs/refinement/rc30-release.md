# RC30 Add to pantry page and Pantry edit mode

RC30 is RC29's feature set with one production fix. It changes no schema (`0082_scanner_stations` / 84 migrations), key, permission or scanner binding. See the release notes for the feature list.

RC29's published image must not be deployed: its `/pantry/add` page returned HTTP 500 in the built server. A local function named `process` in the camera scan hook shadowed Node's global in the release bundle, where Next's minifier injects `process.env` guards. Only the release build exposed it; development mode and the earlier Playwright runs used the dev server. The oracle caught it through React error #419 on `/pantry`.

Verification on the rc.30 source: Prettier, lint, TypeScript, OpenAPI validation and the release build pass; 139 unit files / 796 tests pass; all fifteen browser-oracle specs and the recipe-performance test pass against the built standalone server.

Deployment evidence for Tower is recorded below once the deployment is complete.
