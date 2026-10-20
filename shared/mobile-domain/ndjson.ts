/** Decode bounded NDJSON without losing a split UTF-8 character or final unterminated line. */
export async function* readNdjson<T>(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted)
        throw Object.assign(new Error('Response reading stopped.'), { name: 'AbortError' });
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 2_000_000) throw new Error('The response event is too large.');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        if (line) yield JSON.parse(line) as T;
      }
      if (done) break;
    }
    if (signal?.aborted)
      throw Object.assign(new Error('Response reading stopped.'), { name: 'AbortError' });
    if (buffer.trim()) yield JSON.parse(buffer) as T;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
