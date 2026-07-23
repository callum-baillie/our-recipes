# V1 capability matrix

Review-first food discovery includes Open Food Facts exact barcode lookup, USDA name search/detail, branded GTIN fallback, and optional web-camera scanning over trusted HTTPS. See [food-data-integrations.md](food-data-integrations.md).

This is the canonical product-status page for `1.0.0-rc.1`. Bòrd is a self-hosted app for one trusted household network. Household profiles select preferences and preserve attribution; they are not accounts, confidentiality, authentication, or authorization.

| Area        | V1 capability                                                                                                                                                                                                  | Important boundary                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Recipes     | Structured create/edit/import, revisions, lifecycle, collections, tags, photos, search, cooking, and portable recipe export                                                                                    | Portable recipe export is not a full backup or import format                                     |
| Meal plans  | Calendar planning, pinned recipe revision/ingredient/Nutrition snapshots, explicit refresh, copy, status, and ICS export                                                                                       | Planning does not reserve stock or mean food was eaten                                           |
| Pantry      | Products, locations, physical batches, FEFO projections/deductions, mapping, purchase intake, leftovers, corrections, and constrained undo                                                                     | Unknown quantities remain unknown; expiry display is not food-safety advice                      |
| Lists       | One Pantry-aware planned-list generator, durable regeneration identity, manual lists, rename/archive/restore/duplicate/delete, aisles, and explicit purchase intake                                            | Lists do not change Pantry until purchase intake is confirmed                                    |
| Nutrition   | Versioned product records and recipe calculations, profile-linked goals, planned allocations, prepared batches, explicit consumption, diary corrections, charts, and deterministic non-medical recommendations | Normalized calculations are authoritative; planned, stocked, cooked, and served are not consumed |
| AI          | Optional review-first recipe, meal-plan, image, assistant, and summary actions with workload settings and deterministic tests                                                                                  | No call occurs without configuration and an explicit action; output is reviewed before mutation  |
| Profiles    | Signed active-profile selection, actor attribution, personalized preferences, and automatic one-to-one Nutrition linkage                                                                                       | Anyone who can reach the trusted app can switch profiles                                         |
| Offline     | Warmed recipe/library reads and local images; honest fallback for uncached pages                                                                                                                               | Read-only: writes are never queued or replayed                                                   |
| Recovery    | Scheduled/manual checksummed backup, validation, safety backup, atomic restore, and startup migration copy                                                                                                     | Keep an independently protected off-machine copy                                                 |
| API         | 104-operation stable OpenAPI surface with every remaining handler explicitly classified as internal or retired                                                                                                 | Internal first-party UI routes have no external compatibility promise                            |
| Diagnostics | App/schema/migration status and a redacted support bundle                                                                                                                                                      | Default bundle excludes household content, paths, origins, and secret values                     |

## Supported release environment

- Node 24 with pnpm 11 for source installs.
- Docker with a persistent `/data` mount and non-root UID/GID `1001` runtime after mount initialization.
- Current Chromium, Firefox, and Safari releases; iPhone Safari remains a release-candidate device acceptance gate until recorded on the target device.
- Exact `APP_ORIGIN`, a unique `COOKIE_SECRET` of at least 32 characters, and trusted-network access only.
- SQLite, uploads, generated artifacts, and backup bundles on one durable local data root.

Nutrition is informational and non-medical. The app does not diagnose conditions, establish individual clinical requirements, or make food-safety decisions.
