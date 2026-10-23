/** Versioned, bounded presentation data shared by web and native. No raw record IDs. */
export type AppActionReviewMetadata = {
  schemaVersion: 1;
  subject: { kind: string; label: string; href?: string };
  effect: string;
  context: { label: string; value: string }[];
  changes: { label: string; before?: string; after: string }[];
  caveats: string[];
};

export function actionReviewLines(review: AppActionReviewMetadata) {
  return [
    ...review.context,
    ...review.changes.map((change) => ({
      label: change.label,
      value: change.before === undefined ? change.after : `${change.before} → ${change.after}`,
    })),
  ];
}
