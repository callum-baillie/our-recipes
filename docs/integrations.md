# Account integrations

Settings → Integrations (`/settings/integrations`) is available to signed-in users. The profile menu also links to My integrations. Other household settings remain admin-only.

## VeSync

- Add one or several VeSync accounts with distinct names. Sign-in is performed on the server; passwords are not saved. Sessions are encrypted with the existing VeSync encryption key.
- Each account card has Settings, Sync now, status, last successful sync and next scheduled check. Settings offers account removal, profile assignment/removal, and manual, 15-minute, 30-minute, hourly, 6-hour, 12-hour or daily sync.
- Connections start in manual mode, including migrated onboarding connections. Enable a schedule explicitly.
- Admins using their own active profile may map multiple scale profiles in their account to different household nutrition profiles. Other users may connect their own VeSync accounts to their own linked profiles. Household profile switching does not transfer ownership of credentials.
- Account credentials, available remote profiles and connection settings are visible only to the authenticated owner. A recipient of an assignment can remove their own assignment and connect a different account. An admin may remove household assignments without viewing the other user's provider credentials.
- One scale assignment per destination profile and one destination per remote profile within an account are enforced transactionally. Existing assignments must be removed before replacing them.
- Sync imports the available V3 history within the provider's bounded pagination, deduplicating by profile, date, weight and imported source. Imported body fat remains separate from qn-scale-ble estimates. Current profile inputs and calorie targets are not overwritten.
- Paused weight tracking and archived destinations are skipped. Jobs recheck the connection, mappings, owner authorization and tracking state after remote requests before writing.
- Removing an account cascades its assignments, stops future sync and preserves measurements. Removing an assignment prevents an in-flight sync from importing into that destination.

## Scheduling and migration

Migration 0058 adds `integration_accounts` and references it from scale assignments. Historical onboarding connections are adopted into an account owned by their recorded authenticated creator; older records without that attribution are held by the first non-banned admin. They are never assigned credential ownership based only on the destination household profile. Historical sessions that cannot be decrypted remain removable and show a reconnect message.

The Node server starts a minute-resolution scheduler through instrumentation. Due times survive restarts; overdue accounts are considered on startup. Database leases prevent concurrent manual/background imports across server workers. Failed jobs preserve a user-safe status and retry no sooner than the configured interval (minimum 15 minutes). No scheduler or live provider call runs during tests or the production build. Sync needs a running Bòrd server and measurements uploaded through VeSync. Expired provider sessions require removing and reconnecting the account; passwords are not retained for unattended reauthentication.

`GET /api/v1/integrations` and `POST /api/v1/integrations` are first-party session-only routes, excluded from external API keys. Mutation input is validated and exact trusted-origin checks are retained. Existing per-profile scale routes also require authenticated account/profile authorization.
