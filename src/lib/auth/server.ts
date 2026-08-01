import 'server-only';

import { apiKey } from '@better-auth/api-key';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { sendAuthEmail } from '@/lib/auth/email';

ensureDatabase();

const config = getRuntimeConfig();
const authUrl = new URL(config.auth.baseUrl);

export const auth = betterAuth({
  appName: 'Bòrd',
  baseURL: config.auth.baseUrl,
  secret: config.auth.secret,
  trustedOrigins: [
    config.auth.baseUrl,
    'bord://',
    ...(config.appOrigin ? [config.appOrigin] : []),
    ...config.trustedOrigins,
  ],
  database: drizzleAdapter(getDatabase(), {
    provider: 'sqlite',
    schema,
    transaction: true,
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 15,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendAuthEmail({
        to: user.email,
        subject: 'Reset your Bòrd passphrase',
        text: `Use this one-time link to reset your Bòrd passphrase:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
      }).catch((error) => console.error('Could not send the password reset email.', error));
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendAuthEmail({
        to: user.email,
        subject: 'Verify your Bòrd email',
        text: `Verify your email address to finish securing your Bòrd profile:\n\n${url}`,
      }).catch((error) => console.error('Could not send the verification email.', error));
    },
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
