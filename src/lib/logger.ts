/**
 * Structured logging for the server. One line per event on stdout (debug, info) or stderr
 * (warn, error), so `docker logs` and Dozzle show the same stream and Dozzle can filter on the
 * `level` field.
 *
 *   LOG_LEVEL   debug | info | warn | error | silent   (default info)
 *   LOG_FORMAT  json | text                            (default json)
 *
 * Never put credentials, cookies or personal data in a message; field values under sensitive
 * keys are redacted as a second line of defence.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Record<string, unknown>;

const SERVICE = 'bord';
const RANK: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};
const SENSITIVE_KEY =
  /(?:secret|token|password|passphrase|authorization|cookie|api[-_]?key|credential|email)/iu;
const MAX_DEPTH = 4;
const MAX_STRING = 2_000;

export function resolveLogLevel(value: string | undefined): LogLevel | 'silent' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'warning') return 'warn';
  if (normalized && normalized in RANK) return normalized as LogLevel | 'silent';
  return 'info';
}

export function resolveLogFormat(value: string | undefined): 'json' | 'text' {
  return value?.trim().toLowerCase() === 'text' ? 'text' : 'json';
}

function serialize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message.slice(0, MAX_STRING),
      stack: value.stack?.split('\n').slice(0, 8).join('\n'),
      ...(value.cause !== undefined && depth < MAX_DEPTH
        ? { cause: serialize(value.cause, depth + 1) }
        : {}),
    };
  }
  if (typeof value === 'string')
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (!value || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => serialize(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : serialize(item, depth + 1),
    ]),
  );
}

function render(level: LogLevel, component: string, message: string, fields: LogFields): string {
  const time = new Date().toISOString();
  const safe = serialize(fields) as LogFields;
  if (resolveLogFormat(process.env.LOG_FORMAT) === 'json')
    return JSON.stringify({ time, level, service: SERVICE, component, msg: message, ...safe });
  const detail = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
  return `${time} ${level.toUpperCase().padEnd(5)} [${component}] ${message}${detail}`;
}

export type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  enabled: (level: LogLevel) => boolean;
  child: (component: string) => Logger;
};

export function createLogger(component: string): Logger {
  const enabled = (level: LogLevel) => RANK[level] >= RANK[resolveLogLevel(process.env.LOG_LEVEL)];
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (!enabled(level)) return;
    const line = `${render(level, component, message, fields)}\n`;
    (level === 'warn' || level === 'error' ? process.stderr : process.stdout).write(line);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    enabled,
    child: (name) => createLogger(`${component}.${name}`),
  };
}

export const logger = createLogger('app');
