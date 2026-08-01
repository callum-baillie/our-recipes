export function getAssistantSheetHeights(windowHeight: number, topInset: number) {
  const expandedHeight = Math.max(0, windowHeight - Math.max(topInset, 12));
  const compactHeight = Math.min(expandedHeight, Math.max(460, windowHeight * 0.55));

  return { compactHeight, expandedHeight };
}
