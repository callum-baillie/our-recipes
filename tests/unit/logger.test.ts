import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, resolveLogFormat, resolveLogLevel } from '@/lib/logger';

describe('logger', () => {
  let out: string[];
  let err: string[];

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('defaults to info and falls back on unknown values', () => {
    expect(resolveLogLevel(undefined)).toBe('info');
    expect(resolveLogLevel('nonsense')).toBe('info');
    expect(resolveLogLevel('WARNING')).toBe('warn');
    expect(resolveLogLevel(' debug ')).toBe('debug');
    expect(resolveLogFormat('text')).toBe('text');
    expect(resolveLogFormat(undefined)).toBe('json');
  });

  it('filters by level and sends warnings and errors to stderr', () => {
    vi.stubEnv('LOG_LEVEL', 'warn');
    const log = createLogger('test');
    log.debug('quiet');
    log.info('quiet');
    log.warn('careful');
    log.error('broken');
    expect(out).toHaveLength(0);
    expect(err.map((line) => JSON.parse(line).level)).toEqual(['warn', 'error']);
  });

  it('writes one JSON line with service, component and fields', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');
    createLogger('http').child('gate').debug('seen', { status: 401 });
    const line = JSON.parse(out[0]);
    expect(line).toMatchObject({
      level: 'debug',
      service: 'bord',
      component: 'http.gate',
      msg: 'seen',
      status: 401,
    });
    expect(typeof line.time).toBe('string');
  });

  it('redacts sensitive fields and serialises errors', () => {
    const log = createLogger('test');
    log.error('failed', {
      apiKey: 'bord_sk_secret',
      nested: { authorization: 'Bearer abc', ok: 1 },
      error: new Error('boom'),
    });
    const line = JSON.parse(err[0]);
    expect(line.apiKey).toBe('[redacted]');
    expect(line.nested).toEqual({ authorization: '[redacted]', ok: 1 });
    expect(line.error.message).toBe('boom');
    expect(JSON.stringify(line)).not.toContain('bord_sk_secret');
  });

  it('silent emits nothing and text format is one readable line', () => {
    vi.stubEnv('LOG_LEVEL', 'silent');
    createLogger('test').error('nothing');
    expect(err).toHaveLength(0);
    vi.stubEnv('LOG_LEVEL', 'info');
    vi.stubEnv('LOG_FORMAT', 'text');
    createLogger('test').info('hello', { a: 1 });
    expect(out[0]).toMatch(/INFO {2}\[test\] hello \{"a":1\}\n$/u);
  });
});
