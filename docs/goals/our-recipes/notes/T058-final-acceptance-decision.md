# T058 — Final local acceptance-flow decision

## Result: not complete

T057 closes the original cross-surface evidence gap. The checked local product
now has responsive desktop/tablet/mobile proof, system light/dark presentation
with a dark-scheme axe pass, Letter/A4 recipe PDFs, and a real paginated
full-text library check over 10,000 SQLite rows. The core non-browser gate,
long household browser workflow, and baseline accessibility flows are current.

## Remaining acceptance gaps

| Area | Current evidence | Remaining action |
| --- | --- | --- |
| Local household workflow | Focused E2E and integration receipts cover nearly every feature, but the release checklist still lacks one fresh flow that explicitly combines profile archive/restore, tag governance, collection management, captures/exports, recipe history/preferences, cooking, planning, shopping, PWA read, and backup review. | Select T059. |
| OpenAI provider | No SDK/provider boundary, mock contract, credential decision, or paid-call approval. | Credential/operator-gated; do not implement a callable path. |
| OCR, HEIC/HEIF, archive intake | T053 identifies unresolved model/decoder/archive licensing, deployment, limits, and hostile-fixture decisions. | Separate high-risk package after the local release flow. |
| Docker/Unraid | Static image/compose/template and daemon-run test script exist. `docker info` still cannot find the Docker Desktop Linux engine pipe. | Requires a Docker daemon and mounted-volume operator environment. |
| Final release oracle | Docker proof and the above capabilities remain absent. | Final Judge remains premature. |

## Selected package: T059

Extend the existing Chromium household workflow into an explicit final local
acceptance flow. It should begin on an empty test root and include profile
archive/restore, tag governance, collection management, review-first
capture/import/JSON-LD plus JSON-LD/Markdown portability downloads, rich recipe
revision/preference/history actions, cooking, planning/shopping, PWA read, and
backup validation. It must assert real user-visible state or downloaded
responses for each step and mark the corresponding local release checklist
item only after fresh evidence passes.

This is a coherent validation package, not a pretext to change product
behavior. A discovered missing workflow requires a new package rather than a
test that papers over it.
