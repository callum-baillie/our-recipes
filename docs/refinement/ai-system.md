# AI execution, policy and recovery

This document describes the delivered contracts on `refinement/full-project-completion`, based on `a278f81`. Tests use synthetic households and deterministic providers. They establish application behavior, not live model quality, latency or billing.

## Ownership and effective configuration

Installation administrators manage workload enablement, supported/custom model IDs, compatible reasoning, generation rate allowance, Direct/Batch defaults and threshold, permitted personal overrides, response-token ceiling, request deadline, tool-round ceiling, image quality/framing and image-override policy in **Household settings → AI**. Account enablement and versioned account settings remain separate. Environment credentials and worker/transport configuration stay server-only and require a restart when changed.

**My AI preferences** saves personal processing/model defaults and bounded response-style/planning instructions independently of privacy/summary policy. A global disable or override restriction wins. Personal instructions cannot grant sharing, authority, paid consent or change output schemas. Reset-to-inherited/recommended choices are drafts until the named Save action. A conflict retains the draft; load current, compare, then deliberately retain/rebase or discard it. Summary refresh saves only its own policy group and always names the linked account recipient.

Configured models are not silently upgraded or substituted. Unsupported capability/parameter combinations are rejected by the existing capability validation. Unknown custom models have no invented price estimate. Decisions uses the officially supported `gpt-6-luna` contract independently of the selected chat model; this does not authorize fallback or additional spending.

## Versioned task guidance

The seven workloads are chat, recipe review/import, recipe generation, meal planning, nutrition estimation, summaries and recipe images. `src/lib/domain/ai-prompts.ts` owns each purpose, input/output description, synthetic example, built-in template and contract version. Permissions, tool effects, structured schemas and private-data gates remain immutable application rules.

Administrators edit guidance in **Task guidance and versions**. `{{task}}` is required and is the only supported variable. No private record or credential interpolation is supported. Preview uses synthetic context and makes no request. Save validates the template and change reason against the current version. Immutable versions are stored by migration `0071_ai_prompt_versions`; history is bounded/paged in groups of ten. Compare and rollback copy a version into a draft; saving creates a new version rather than rewriting history. Workload execution/audit records retain the effective model and prompt version. Queued jobs retain their approved settings; current access policy is still rechecked before execution.

For rollout: review the synthetic preview and deterministic tests, save one workload version, inspect sanitized task outcomes, and deliberately restore the previous version as a new version if required. Guidance changes do not run jobs or regenerate existing images/results.

## Progressive chat and request identity

The OpenAI Responses streaming callback, HTTP stream and web/native consumers all display text before completion. No timer reveals already-completed text. The shared NDJSON reader handles fragmented UTF-8, final unterminated records, bounded events and cancellation. Events have increasing sequence numbers. `done` carries canonical saved text; a stream ending without `done` is incomplete. Status messages describe observable work or use neutral **Preparing a response** wording.

First-party message requests may carry one UUID `operationId`, bound to the account, profile, thread and normalized message/attachments/tool consent. Migration `0069_ai_chat_turn_recovery` stores running/completed/failed/cancelled receipts. Completed exact retry returns the stored result before provider access. Changed intent conflicts. Running or interrupted work must be reconciled from the conversation; it is never automatically rerun as a new paid operation. A later typed draft stays separate from the submitted snapshot.

**Stop generating** aborts supported network/provider work; it does not undo a queued job or committed operation or guarantee that billing stopped. Closing chat, stopping a turn, cancelling a job and reversing saved changes remain different operations. Reopening reads server-owned turns/proposals/jobs. A running or unknown turn blocks a new submission until reviewed. Browser chat retains drafts/attachments and scroll position per thread while its surface remains mounted; native drafts are account/instance/thread-scoped memory and are cleared on logout. Process loss is not a promise of persisted private drafts.

## Curated tools and reviewed changes

`ai-app-operation-catalog.ts` declares typed read/write/paid effects, route loaders, resource scope and validators. POST catalog searches, measures, guidance, enrichment and cooking previews are reads. Reads never import a product, create stock, mark a purchase or log intake. The assistant has no arbitrary HTTP, SQL, filesystem or credential tool.

Sharing is checked for the resource actually used. A simple shopping task can operate with unrelated diary, metrics, Pantry and recipe sharing off. Nutrition target sharing and existing guardian/Child grants are checked for the receiving person. Session, account policy, role, sharing and versions are revalidated before delayed execution and every mutation. Unexpected internal exception text is not sent back to the model.

Proposals expose scope, values and per-step outcomes. Simple fields are editable in the review card; a revision creates a fresh proposal with fresh source snapshots and supersedes the old Apply control. Record snapshots remain checked when a dependency appears only in the body; newly created path targets use a server-bound earlier result. Supported bindings return `list.id`, `recipe.id`, `collection.id`, `product.id` or `meal.id` into explicitly allowed fields. Forward/invalid bindings fail before writes. The model cannot guess newly created IDs.

Groups are sequential, not a blanket transaction. A durable boundary is written before each mutation, followed by its acknowledged result. Failed/unknown steps stop later steps. Results distinguish completed, failed, not attempted and outcome unknown and link to affected records. Repeating an acknowledged Apply returns stored results. A lost mutation response requires inspecting current records; it is not safe to submit the same scope as a fresh operation. Six synchronous create APIs additionally support atomic data/response receipts with an `Idempotency-Key`; catalog, Nutrition and purchase operations retain their own domain-specific replay contracts.

Credentials, privileged recovery, binary exports and actions requiring reauthentication use protected UI handoffs. Administrative configuration does not authorize reading other people's private chat or diary.

## Kitchen interview

Conversation guidance starts by reading permitted saved answers and asks one useful question at a time, acknowledges answers, avoids repeating known facts, prioritizes time/equipment/budget/routine/tastes, and keeps sensitive topics optional. Skip, previous-topic and review controls add editable replies without sending automatically. Closing/reopening the embedded surface retains its current conversation and draft; history supports later resumption. There is no fabricated adaptive completion percentage.

`updateMyKitchenContext` accepts an `interviewPatch` and exact saved revision. Omitted facts remain saved. Empty answers are rejected in the conversational patch; deliberate deletion uses `clearFields`. The guided full-form contract remains compatible. Both use the same validated context/service and named account owner. Allergy and Nutrition consent settings are not modified. Saved answers, retained unsaved questionnaire answers and proposed AI updates are visibly distinct.

## Deterministic evaluation evidence

- `ai-operation-contracts`: actual handler/session denial; dependent new-list IDs with unrelated sharing off; invalid dependency with no writes; revoked authority; read-effect classification; superseded edits; two reviewed dinners plus Pantry-aware shortages; move/serving change preserving recipe revision with confirmation replay; lost acknowledgement after commit with later steps not attempted; genuine early HTTP text; prompt version/conflict/rollback.
- Existing `ai-assistant-service`, action/job and meal-plan suites cover reviewed recipe adaptation, source revision conflicts, partial jobs and explicit application. Catalog fixtures cover reviewed scanned-food identity, exact revisions and completed replay during provider outage.
- `profile-identity-boundary` covers omitted interview facts, explicit deletion, stale revision and preserving identity/personal fields.
- Shared streaming/native tests cover fragmented Unicode, final buffers, sequence gaps/duplicates, abort and running-turn recovery. Browser `ai-completion` covers prompt validation/conflict and progressive text/next-draft/exact recovery at desktop, short mobile and 320px enlarged text.
- Image fixtures and the live-evaluation rubric are in [recipe-images.md](recipe-images.md). No deterministic test establishes photo realism.

These are executable application evaluations with scripted provider outputs, not measurements of a live model's tool-selection accuracy. Live provider/passkey/email/device flows remain explicitly outside this evidence; release evidence lists the executed commands and limits.

## Official references checked during implementation

[Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [TypeScript Responses API](https://developers.openai.com/api/reference/typescript/resources/responses), [image parameters](https://developers.openai.com/api/docs/guides/image-generation), [model capabilities](https://developers.openai.com/api/docs/models), and [Decisions](https://developers.openai.com/api/docs/guides/decisions) were checked on 2026-10-19/20. Better Auth configuration was checked against the installed 1.6.25 implementation and [official options](https://better-auth.com/docs/reference/options), [security](https://better-auth.com/docs/reference/security) and [rate-limit](https://better-auth.com/docs/concepts/rate-limit) guidance. Provider support can change; validate a custom model before changing production policy.
