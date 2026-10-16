# Printing, inventory and background work

## Shared print workspace

Use **Export / print** from a recipe, the recipebook, planner, shopping list or pantry. `/print` provides document-specific options alongside an actual generated PDF. Update preview after changing options; the download is the previewed PDF. ZIP generates the currently selected options. Mobile browsers can use Open PDF and the browser's share/print menu.

The renderer continues to use the vendored pdfcn components with Forme. Recipe cards support ingredients, shopping checkboxes, saved store-route order, method, photos, nutrition, equipment, notes and source. Store ordering uses saved item mappings and category classification; unmatched ingredients remain explicitly unassigned. Photos are read from protected local storage and resized before embedding. Saved recipe revisions and meal-specific adaptations are preserved in plan cards. Nutrition values retain their source/estimate labeling.

Meal schedules cover up to 56 days with separate recipe cards. Exports support 100 recipes, 500 scheduled meals or 2,000 inventory/list rows. PDF generation is bounded to four queued requests per server process. Recipe PDF/ZIP and calendar/Markdown/JSON-LD downloads remain available.

## Pantry inventory

**Inventory mode** opens `/pantry/inventory`. Filter by shelf, count stock, save individual rows or all changed counts, and remove batches. Each write uses the batch's expected version. A concurrent edit is reported without silently replacing it. Unknown stock is never converted to zero by merely opening the screen. Removals preserve inventory history and use the normal restock reconciliation workflow.

## Shopping

Shared trip notes use version checks to preserve concurrent edits. **Buy again & quick add** offers recorded purchases and multiline paste. Paste accepts up to 100 names, skipping names already on the active list. It does not invent quantities. Shared items refresh while the visible page is idle, preserving pending/unsaved local changes. Per-item saves are serialized. Failed saves retain edits. Store routes, pantry intake, Can't Find, substitutions, undo and screen wake lock continue to use the existing workflows.

## Queue options

The default queue is embedded and durable in SQLite. It requires no additional service. In production, the existing worker processes queued recipe/image jobs and checks weekly schedules. `AI_WORKER_ENABLED=false` pauses processing. Development does not automatically run paid work.

For an optional self-hosted Redis transport:

```sh
docker compose -f docker-compose.yml -f docker-compose.queue.yml up -d
```

The override adds Redis with AOF persistence and `noeviction`, and configures `QUEUE_BACKEND=redis` and `REDIS_URL`. Redis has no host-published port. In Unraid, deploy Redis on the same private Docker network, persist `/data`, then configure these two variables on Bòrd. Keep Bòrd's SQLite database on a local filesystem, not an SMB/NFS share. Queue messages contain wake-up signals; task payloads, progress and results remain in Bòrd's database.

A Redis outage pauses its worker transport; it does not discard SQLite tasks. BullMQ reconnects and schedules resume when Redis returns. Use a unique Redis database per Bòrd installation to avoid sharing the queue name between unrelated installations. Redis credentials stay in environment variables and are not exposed in the UI.

`/settings/automation` (admin) shows transport status. `/account/automation` contains personal processing preferences, weekly schedules, task progress, cancellation, retry and draft review. Personal schedules are tied to the authenticated account, and execution rechecks that account is active and has an adult role. Disabling the schedule revokes future queued schedule execution. The worker uses atomic leases and heartbeats. Interrupted direct requests require an explicit retry because blindly replaying an uncertain paid request can duplicate charges.

## AI processing and schedules

Bulk recipe and image jobs can use Direct, Batch, or Automatic with an item threshold. OpenAI Batch supports Responses and Images endpoints and can take up to 24 hours. Cancellation cannot undo work already sent to a provider. Partial recipe retries create a new job for failed items, preserving successful drafts.

Weekly meal planning is off by default. Enabling it requires explicit authorization for paid scheduled requests. Choose weekday, local hour, IANA timezone, date offset, duration, meal slots, servings, household members and recipe source. One draft is queued per scheduled local date, atomically with the scheduling marker. Existing plan slots are kept. Generated plans require review before changing the planner. The app must be running later on the scheduled day; it does not replay weeks missed while offline. No image jobs are automatically added by the schedule.

New schema: `0063_task_preferences.sql` and `0064_shopping_list_notes.sql`. These follow the pending `0062` migration; do not rewrite applied migration SQL.

## Reference sources

- pdfcn: https://www.pdfcn.dev/
- OpenAI Batch: https://developers.openai.com/api/docs/guides/batch
- BullMQ production persistence: https://docs.bullmq.io/guide/going-to-production
- Shopping-list workflow inspiration: https://www.anylist.com/lists

Implementation checks are recorded in the task response. This document does not claim that Redis, Docker or Unraid has been deployed or validated on a device.
