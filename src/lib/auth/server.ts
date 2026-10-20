import 'server-only';

import { apiKey } from '@better-auth/api-key';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { withAuthenticationRequest } from './restore-fence';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { issueEmailVerification, consumeEmailVerification } from './email-verification-tokens';
import { admin } from 'better-auth/plugins';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { sendAuthEmail } from '@/lib/auth/email';

ensureDatabase();

const config = getRuntimeConfig();
const authUrl = new URL(config.auth.baseUrl);
// Backup restoration closes/reopens SQLite. Resolve root Drizzle methods at
// operation time so the auth adapter never retains a closed database handle.
const authDatabase = new Proxy({} as ReturnType<typeof getDatabase>, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});

const authentication = betterAuth({
  appName: 'Bòrd',
  baseURL: config.auth.baseUrl,
  secret: config.auth.secret,
  trustedOrigins: [
    config.auth.baseUrl,
    'bord://',
    ...(config.appOrigin ? [config.appOrigin] : []),
    ...config.trustedOrigins,
  ],
  database: drizzleAdapter(authDatabase, {
    provider: 'sqlite',
    schema,
    // Better Auth's transaction callbacks are async; better-sqlite3 requires
    // synchronous callbacks. Its supported sequential mode still claims a
    // verification row atomically with SQLite DELETE ... RETURNING.
    transaction: false,
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: config.auth.requireEmailVerification,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendAuthEmail({
        to: user.email,
        subject: 'Reset your Bòrd passphrase',
        text: `Use this one-time link to reset your Bòrd passphrase:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
      }).catch(() =>
        console.error('Could not send the password reset email. Check the configured transport.'),
      );
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/verify-email') return;
      const token = ctx.query?.token;
      if (typeof token !== 'string' || !consumeEmailVerification(token)) {
        if (ctx.query?.callbackURL)
          throw ctx.redirect(new URL('/verify-email?invalid=1', config.auth.baseUrl).href);
        throw new APIError('UNAUTHORIZED', {
          code: 'INVALID_TOKEN',
          message: 'This verification link is no longer valid. Request a new link.',
        });
      }
    }),
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url, token }) =>
      withAuthenticationRequest(async () => {
        const issued = await issueEmailVerification(token, (await authentication.$context).secret);
        const link = new URL(url);
        link.searchParams.set('token', issued);
        void sendAuthEmail({
          to: user.email,
          subject: 'Verify your Bòrd email',
          text: `Verify your email address to finish securing your Bòrd profile:\n\n${link.href}`,
        }).catch(() =>
          console.error('Could not send the verification email. Check the configured transport.'),
        );
      }),
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
  },
  plugins: [
    expo(),
    admin({
      defaultRole: 'parent',
      adminRoles: ['admin'],
      impersonationSessionDuration: 0,
    }),
    apiKey({
      defaultPrefix: 'bord_sk_',
      defaultKeyLength: 64,
      requireName: true,
      maximumNameLength: 64,
      startingCharactersConfig: { shouldStore: true, charactersLength: 16 },
      enableMetadata: true,
      enableSessionForAPIKeys: false,
      keyExpiration: {
        defaultExpiresIn: 90 * 24 * 60 * 60,
        minExpiresIn: 1,
        maxExpiresIn: 365,
      },
      rateLimit: {
        enabled: true,
        timeWindow: 60_000,
        maxRequests: 120,
      },
      permissions: {
        defaultPermissions: {
          recipes: ['read'],
          mealPlans: ['read'],
          shoppingLists: ['read'],
          collections: ['read'],
          pantry: ['read'],
        },
      },
    }),
    passkey({
      rpID: authUrl.hostname,
      rpName: 'Bòrd',
      origin: authUrl.origin,
      registration: { requireSession: true },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;

// Keep in-flight library operations on one side of a restore. The durable swap
// marker still guards database access across process interruption/restart.
const wrappers = new WeakMap<
  (...args: never[]) => unknown,
  (...args: unknown[]) => Promise<unknown>
>();
function fenced(value: unknown, receiver: object) {
  if (typeof value !== 'function') return value;
  let wrapped = wrappers.get(value as (...args: never[]) => unknown);
  if (!wrapped) {
    wrapped = (...args: unknown[]) =>
      withAuthenticationRequest(async () => Reflect.apply(value, receiver, args));
    wrappers.set(value as (...args: never[]) => unknown, wrapped);
  }
  return wrapped;
}
const api = new Proxy(authentication.api, {
  get(target, key) {
    return fenced(Reflect.get(target, key, target), target);
  },
});
export const auth = new Proxy(authentication, {
  get(target, key) {
    if (key === 'api') return api;
    const value = Reflect.get(target, key, target);
    return key === 'handler' ? fenced(value, target) : value;
  },
});
