/** Recipe times use zero for unprovided values; no separate explicit-zero marker exists. */
export function formatRecipeDuration(totalMinutes: number): string | null {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ');
}
