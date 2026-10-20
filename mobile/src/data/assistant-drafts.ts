/** Ephemeral, account/instance scoped drafts. No credentials or draft content is written to disk. */
const drafts = new Map<string, unknown>();
export function readAssistantDraft<T>(scope: string): T | undefined {
  return drafts.get(scope) as T | undefined;
}
export function retainAssistantDraft(scope: string, draft: unknown) {
  drafts.delete(scope);
  drafts.set(scope, draft);
  while (drafts.size > 24) drafts.delete(drafts.keys().next().value!);
}
export function clearAssistantDrafts() {
  drafts.clear();
}
