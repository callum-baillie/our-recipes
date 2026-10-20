/** Links are inert until deliberately opened; imported/model HTML is never executed. */
export function safeChatHref(value: string): string | null {
  if (!value || value.length > 2048 || /[\\\u0000-\u0020]/u.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
