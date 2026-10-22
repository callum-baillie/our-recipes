export const UNKNOWN_AI_OUTCOMES = [
  'provider_submission_outcome_unknown',
  'worker_interrupted_review_before_retry',
  'image_generation_outcome_unknown',
];
export const UNKNOWN_AI_OUTCOME_MESSAGE =
  'The provider outcome is unknown. Review existing results and reconcile the original request before starting more paid work. This operation will not be submitted again.';
export const AI_BATCH_NOT_STARTED_MESSAGE =
  'Paid processing was not started. Review current permissions and settings before retrying.';
export function isUnknownAiOutcome(errorCode: string | null | undefined) {
  return UNKNOWN_AI_OUTCOMES.includes(errorCode ?? '');
}
