/** Targets are named in the action summary/record label; transport identities are never review content. */
export function isVisibleReviewField(key: string) {
  return !/(?:^id$|Id$|Ids$|^expected|^version$|Revision$|^intentHash$|^sourceDigest$|^stepRefs$)/u.test(
    key,
  );
}
export function fieldLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}
export function reviewValues(value: unknown, prefix = ''): { label: string; value: string }[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => reviewValues(item, `${prefix} ${index + 1}`.trim()));
  if (value && typeof value === 'object')
    return Object.entries(value)
      .filter(([key]) => isVisibleReviewField(key))
      .flatMap(([key, item]) =>
        reviewValues(item, [prefix, fieldLabel(key)].filter(Boolean).join(' · ')),
      );
  return [
    {
      label: prefix || 'Value',
      value:
        value == null
          ? 'Not set'
          : typeof value === 'boolean'
            ? value
              ? 'Yes'
              : 'No'
            : String(value),
    },
  ];
}
export function editableProposalFields(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.entries(body).filter(
    ([key, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value) &&
      !/(?:Id$|^expected|^version$|^kind$|^scope$)/u.test(key),
  );
}
export function revisedProposalBody(original: unknown, draft: Record<string, string | boolean>) {
  if (!original || typeof original !== 'object' || Array.isArray(original)) return original;
  const copy = { ...(original as Record<string, unknown>) };
  for (const [key, value] of editableProposalFields(original)) {
    if (!(key in draft)) continue;
    const entered = draft[key];
    if (typeof value === 'number') {
      if (typeof entered !== 'string' || !entered.trim() || !Number.isFinite(Number(entered)))
        throw new Error(`Enter a valid number for ${fieldLabel(key)}.`);
      copy[key] = Number(entered);
    } else copy[key] = entered;
  }
  return copy;
}
export function revisionMessage(currentDraft: string, title: string) {
  return [currentDraft.trimEnd(), `Please revise the proposal “${title}”. Changes: `]
    .filter(Boolean)
    .join('\n\n');
}
