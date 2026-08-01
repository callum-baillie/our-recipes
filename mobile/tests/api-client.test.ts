import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl } from '@/data/connection-config';

describe('Bòrd web-app connection', () => {
  it('normalizes a server URL without changing its host or path', () => {
    expect(normalizeBaseUrl(' https://kitchen.example.com/bord/ ')).toBe(
      'https://kitchen.example.com/bord',
    );
  });

  it('rejects non-http connection schemes', () => {
    expect(() => normalizeBaseUrl('file:///tmp/bord')).toThrow(/http or https/u);
  });

  it('allows local HTTP but refuses cleartext remote authentication', () => {
    expect(normalizeBaseUrl('http://192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    expect(() => normalizeBaseUrl('http://recipes.example.com')).toThrow(/HTTPS/u);
  });
});
