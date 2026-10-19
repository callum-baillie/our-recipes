# Account and household settings

Settings use the shared page header, gutters, fields, action roles and native dialog lifecycle. The settings rail collapses at 900px into a labelled section disclosure. Destination names and ordering are shared with the household overview. The shell and settings component rules belong to `settings-layout.css`; page-specific workspaces retain their own modules.

## Recipients and save boundaries

- My profile edits the signed-in account's linked profile. Nutrition preferences edit the selected household Nutrition profile; the component is keyed by that recipient.
- Personal AI defaults and privacy/summary policy are independent transactions. An account-page summary update explicitly uses the linked account recipient, even when another household person is viewed. Its returned snapshots are displayed for that recipient. Existing active-profile consumers keep their original scope.
- Scheduling saves only scheduling. Legacy processing fields are accepted for compatibility but cannot overwrite personal AI processing preferences. Queued work keeps its own policy.
- A form owns its acknowledged snapshot, pending lock and local feedback. Fields in a submitted form are frozen until acknowledgement. Errors retain the draft; later edits clear stale success feedback. Independent forms do not adopt another form's draft or response.
- Profile identity, access role, guardian assignment and archive state have separate actions. Role/archive responses retain known metadata, then reconcile an administrator-authorised enriched member snapshot. Identity drafts stay mounted when member disclosures close. A personal identity save retains independently acknowledged interview answers.

## Nutrition preferences

Measurements retain a canonical current draft while display units change. Feet/inches carry and display rounding do not alter the stored quantity. No preference change records a weigh-in or changes a goal.

An estimate preview uses saved profile inputs/version and saved weight. Unsaved preferences and missing prerequisites are shown beside Preview. A reviewed estimate owns its date, activity category and profile version; relevant edits invalidate it. Apply sends that context and an exact goal version when replacing a goal. An uncertain exact retry retains its operation ID. Preferences, preview and goal application remain separate requests.

Coverage and compact-card choices preserve hidden selections, show their limits and expose search/category browsing. Hiding compact facts does not empty its saved selection. Time zones are validated with the same Intl implementation used for local-day grouping. Valid stored regional identifiers remain supported outside the suggested choices.

## Store routes

General preferences and each store draft are independent. Selecting another store caches the current draft. A store response does not replace unsaved general preferences; branch linking only updates associations. Archive uses the saved store, while Duplicate explicitly copies the saved version. New copies have an Open action.

Keyword text remains raw while editing and is parsed at save. Reordering retains stable section identities, keyboard and pointer alternatives, boundary controls and position announcements. Map/template import replaces only the local route draft, provides Undo and moves attention to the route editor. Saving map corrections remembers a review; saving the named store applies the route. Cached review can be requested without paid consent when the workload permits it; a cache miss cannot start new paid analysis without consent.

## Recovery and credentials

Backup creation reports creation. Review validates a specific archive before restore. Changing review intent immediately clears the previous preview and typed confirmation. Failed validation leaves no earlier restore actionable. Archive history is progressively revealed; configuration does not claim successful automatic runs.

Reset keeps its submitted phrase stable, blocks pending dismissal and reports failure inside the active dialog. Closing a page does not cancel a server operation.

API-key secrets remain transient one-time results. Another Create or Rotate cannot replace an unacknowledged result. New drafts reset permission/expiry defaults deliberately. Disabled and expired are independent states; enabling does not renew expiry. Identity confirmation never persists passphrases as ordinary drafts.

Profile onboarding keeps its popup within the native modal, one bounded body scroll and reachable actions. Closing protects an ordinary draft; pending creation and recovery-code acknowledgement own dismissal until their outcome is resolved. Created profiles are reconciled using actual roles. Recovery codes and passphrases are not stored in session draft storage.

## Verification boundaries

Use isolated household data, deterministic provider responses and dummy secrets for UI checks. Real provider calls, scale sync, account/key creation, restore and reset are not required. Native platform passkey prompts, software keyboards, assistive-technology announcements and production worker/backup health require separate environment-specific evidence.
