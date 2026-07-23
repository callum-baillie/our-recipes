# Support, security, and compatibility

For ordinary defects, include the app/schema versions and attach the in-app **Redacted diagnostics** export to a [GitHub issue](https://github.com/callum-baillie/bord/issues). Review the JSON before sharing it. The default bundle contains configuration-presence booleans and redacted error fingerprints, not household content or secrets.

Report a suspected vulnerability privately through [GitHub Security Advisories](https://github.com/callum-baillie/bord/security/advisories/new). Do not attach databases, backups, recipe photos, credentials, or unredacted logs to a public issue.

Stable documented `/api/v1` operations follow semantic versioning. Removing or incompatibly changing one requires a deprecation notice in release notes for at least one minor release unless continued support would create an active security or data-integrity risk. Routes listed in `openapi-internal-routes.json` are first-party implementation details or retired compatibility endpoints and do not have that external compatibility guarantee.
