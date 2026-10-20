export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter the URL of your Bòrd web app.');
  const parsed = new URL(trimmed);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Use an http or https web-app URL.');
  }
  if (parsed.protocol === 'http:' && !isPrivateNetworkHost(parsed.hostname)) {
    throw new Error(
      'Use HTTPS for remote Bòrd instances. Plain HTTP is allowed only on a private local network.',
    );
  }
  if (parsed.username || parsed.password)
    throw new Error('Do not include credentials in the instance URL.');
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/u, '');
}

function isPrivateNetworkHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true;
  const parts = normalized.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part) || Number(part) > 255))
    return normalized === '[::1]';
  const [first, second] = parts.map(Number);
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}
