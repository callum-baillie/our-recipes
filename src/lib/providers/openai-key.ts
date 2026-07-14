import 'server-only';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function isUsableOpenAiKey(value: string | undefined): value is string {
  return Boolean(value && value.length >= 20 && !/\s/u.test(value));
}

function developmentKeyFromFile(): string | null {
  if (process.env.NODE_ENV !== 'development') return null;
  try {
    const source = readFileSync(resolve(process.cwd(), '.api_keys'), 'utf8');
    const match = /(?:^|\r?\n)OPENAI_API_KEY\s*=\s*([^\r\n#]+?)(?:\s*(?:#.*)?$)/mu.exec(source);
    const candidate = match?.[1]?.trim();
    return isUsableOpenAiKey(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Returns an API key only to server-only provider construction. Development may
 * use the ignored convenience file; production intentionally relies solely on
 * the injected runtime environment.
 */
export function getOpenAiApiKey(): string | null {
  const environmentKey = process.env.OPENAI_API_KEY?.trim();
  return isUsableOpenAiKey(environmentKey) ? environmentKey : developmentKeyFromFile();
}
