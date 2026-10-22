# RV08 / RV09 image candidate completion

`ai-job-service.ts` now updates candidate, item and audit state together for a
known item failure. Batch failure, expiry, provider cancellation, per-item errors
and pre-execution rejection can no longer leave a candidate labelled requested.
The worker also reconciles historical terminal image jobs in bounded groups of
100 without starting provider work.

A lost Batch submission acknowledgement or interrupted execution lease produces
`outcome_unknown`, rather than a false known failure. Its existing operation is
not automatically resubmitted. A deliberate new paid request is a separate intent
and requires authorization. Cancellation preserves the discarded candidate
marker, and a late Batch poll checks its lease before writing results. Candidate
readiness plus item/audit success is committed in one database transaction after
private storage succeeds. Existing recipe images are never attached or replaced
by generation completion.

Explicit image retries preserve the original still-permitted model, raw prompt/version, personal guidance, quality and size; they do not silently adopt changed defaults. Failed/unknown candidates remain linked from job results so their owned receipt can be inspected or discarded.

Web and native candidate controls describe unknown and failed outcomes locally.
Unknown does not imply provider work or charges were undone. The shared assistant
review calls the action **Prepare an image preview**, explaining separate review
and acceptance. This closes RV09's wording issue without changing acceptance.

## Focused evidence

- Existing `post-review-ai.test.ts` baseline: 20 passing before this patch.
- `rv-image-lifecycle.test.ts`: twelve persistence/worker tests cover historical
  terminal repair, failed/expired/cancelled Batch, completed Batch item errors,
  policy rejection before submission, cancellation during a late poll, lost
  submission acknowledgement, expired lease, and explicit rejection versus transport uncertainty in direct generation, and approved image retry settings. No live provider calls.
- `recipe-image-candidates.test.ts`: existing five tests retain private ownership,
  explicit acceptance, stale recipe rejection, discard and exact receipt replay. Its old timeout-as-failure assertion now requires an unknown outcome; a timeout is not proof the provider did nothing.
- `recipe-image-generator.test.ts`: five mounted component tests, including local
  failed/unknown status and absence of acceptance or automatic regeneration.
- Combined first nine lifecycle cases plus retained post-review AI suite: 29 passing in the
  focused run; the final twelve-case lifecycle run also passed. Full-gate and browser results are recorded in the main register.

No photorealism claim follows from synthetic WebP fixtures. G07's six-dish live
quality and model/tool-choice evaluation still require explicit paid allowance
and credentials, followed by human rubric scores. See `recipe-images.md` and the
bounded opt-in `scripts/evaluate-recipe-images.ts` path. A null-score dry run is
not quality evidence.
