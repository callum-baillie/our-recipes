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
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/u, '');
}

function isPrivateNetworkHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true;
  if (/^(?:127|10)\./u.test(normalized) || /^192\.168\./u.test(normalized)) return true;
  const match = normalized.match(/^172\.(\d{1,2})\./u);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}
