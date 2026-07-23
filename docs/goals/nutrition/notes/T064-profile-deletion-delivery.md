# T064 irreversible profile deletion delivery

- Added a strict deletion payload with exact `DELETE <display name>` confirmation and positive expected version, plus `delete_data` authorization and trusted-origin DELETE API.
- One transaction removes selected-profile command/consumption rows, nutrient children, newest-first intake/allocation/goal/permission histories and measurements; then it deletes only exclusive unreferenced owner-created prepared snapshots or scrubs only their private note when another profile still references them.
- The profile is scrubbed to non-sensitive defaults, versioned, archived, and denied by every direct authorization path. Household recipes, calculations, references, Pantry data and other profiles are not mutated.
- The owner credential is rotated/archived only when no other active owned or explicitly managed Nutrition profile remains. The requester cookie is cleared only when the requester is that invalidated owner, not when an authorized guardian performed the deletion.
- Added an accessible danger control that states the retained boundaries and requires the exact phrase.
- Verification: 175 unit tests and 102 integration tests passed; focused deletion tests, lint, typecheck, formatting and diff checks passed.

The exact GoalBuddy Worker exceeded the single 30-second wait and was interrupted. The PM completed the same bounded allowed-file package.
