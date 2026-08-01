import * as SecureStore from 'expo-secure-store';
import { normalizeBaseUrl } from '@/data/connection-config';

export type ConnectionAuthMethod = 'api-key' | 'account';

export type BordConnectionConfig = {
  baseUrl: string;
  authMethod: ConnectionAuthMethod;
  email?: string;
};

export type ConnectionResult = {
  ok: boolean;
  message: string;
};

const API_KEY_STORAGE_KEY = 'bord.web-app.api-key';

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? `The server returned ${response.status}.`;
}

export class BordApiClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async checkHealth(): Promise<ConnectionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        headers: { Accept: 'application/json' },
      });
      return response.ok
        ? { ok: true, message: 'Web app reached successfully.' }
        : { ok: false, message: await responseMessage(response) };
    } catch {
      return {
        ok: false,
        message: 'The web app could not be reached. Check the URL and local network.',
      };
    }
  }

  async verifyApiKey(apiKey: string): Promise<ConnectionResult> {
    if (!apiKey.trim()) return { ok: false, message: 'Enter an API key.' };
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/recipes`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
      });
      return response.ok
        ? { ok: true, message: 'Connected with a scoped API key.' }
        : { ok: false, message: await responseMessage(response) };
    } catch {
      return { ok: false, message: 'The API-key connection could not be verified.' };
    }
  }

  async signIn(email: string, passphrase: string): Promise<ConnectionResult> {
    if (!email.trim() || !passphrase) {
      return { ok: false, message: 'Enter your account email and passphrase.' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: passphrase,
          rememberMe: true,
          callbackURL: '/',
        }),
      });
      return response.ok
        ? { ok: true, message: 'Signed in to the connected Bòrd web app.' }
        : { ok: false, message: await responseMessage(response) };
    } catch {
      return { ok: false, message: 'Account sign-in could not reach the web app.' };
    }
  }
}

export async function storeApiKey(apiKey: string): Promise<void> {
  if (apiKey.trim()) {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey.trim());
  } else {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  }
}

export async function readApiKey(): Promise<string> {
  return (await SecureStore.getItemAsync(API_KEY_STORAGE_KEY)) ?? '';
}
