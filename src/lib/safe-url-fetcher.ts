import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

type Lookup = (host: string) => Promise<Array<{ address: string }>>;
type Fetch = typeof fetch;

function privateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !privateIpv4(address);
  const value = address.toLowerCase();
  return !(
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    value.startsWith('::ffff:')
  );
}

async function defaultLookup(host: string): Promise<Array<{ address: string }>> {
  return dnsLookup(host, { all: true, verbatim: true });
}

async function assertPublicTarget(url: URL, lookup: Lookup): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Only public http(s) URLs without credentials may be captured.');
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new Error('That URL resolves to a private or reserved network address.');
}

export async function fetchPublicText(
  input: string,
  dependencies: { fetchImpl?: Fetch; lookup?: Lookup } = {},
): Promise<{ url: string; contentType: string; text: string; html: string | null }> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const lookup = dependencies.lookup ?? defaultLookup;
  let url = new URL(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicTarget(url, lookup);
    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'text/html,text/plain;q=0.9' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS)
        throw new Error('The URL redirected too many times.');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`The source responded with HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('text/html') && !contentType.startsWith('text/plain'))
      throw new Error('Only text and HTML recipe pages can be captured here.');
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_BYTES) throw new Error('The source is too large to capture safely.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error('The source is too large to capture safely.');
    const raw = new TextDecoder().decode(bytes);
    const text = contentType.startsWith('text/html')
      ? raw
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
      : raw;
    return {
      url: url.toString(),
      contentType,
      text: text.replace(/\n{3,}/g, '\n\n').trim(),
      html: contentType.startsWith('text/html') ? raw : null,
    };
  }
  throw new Error('The URL could not be captured.');
}
