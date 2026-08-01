import * as React from 'react';
import * as SecureStore from 'expo-secure-store';
import type { ImageSourcePropType } from 'react-native';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { normalizeBaseUrl } from '@/data/connection-config';
import { authFailureMessage } from '@/auth/auth-errors';

const INSTANCE_KEY = 'bord.mobile.instance-url';
const SCHEME = 'bord';

type AuthStatus = 'booting' | 'needs-instance' | 'needs-auth' | 'authenticated';

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

function storageSuffix(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function createClient(baseUrl: string) {
  const client = createAuthClient({
    baseURL: baseUrl,
    // Expo Go cannot register the app's custom URL scheme, so Linking reports
    // a transient exp:// origin. Send the stable native client origin that the
    // Bòrd server explicitly trusts for credential requests.
    fetchOptions: {
      headers: { Origin: `${SCHEME}://` },
    },
    plugins: [
      expoClient({
        scheme: SCHEME,
        storage: SecureStore,
        storagePrefix: `bord-${storageSuffix(baseUrl)}`,
        cookiePrefix: ['better-auth', 'bord'],
      }) as never,
    ],
  });
  return client as typeof client & { getCookie: () => string };
}

function profileCookieKey(baseUrl: string) {
  return `bord-${storageSuffix(baseUrl)}-active-profile`;
}

type MobileAuthClient = ReturnType<typeof createClient>;

type AuthContextValue = {
  status: AuthStatus;
  instanceUrl: string | null;
  user: SessionUser | null;
  error: string | null;
  configureInstance: (value: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  recoverWithCode: (email: string, recoveryCode: string, newPassphrase: string) => Promise<void>;
  signOut: () => Promise<void>;
  forgetInstance: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  requestNdjson: <T>(path: string) => Promise<T[]>;
  requestEvents: <T>(path: string, init?: RequestInit) => Promise<T[]>;
  assetSource: (path: string) => ImageSourcePropType | undefined;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? `The server returned ${response.status}.`;
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const clientRef = React.useRef<MobileAuthClient | null>(null);
  const profileCookieRef = React.useRef('');
  const [status, setStatus] = React.useState<AuthStatus>('booting');
  const [instanceUrl, setInstanceUrl] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const restoreSession = React.useCallback(async (baseUrl: string) => {
    const client = createClient(baseUrl);
    clientRef.current = client;
    profileCookieRef.current = (await SecureStore.getItemAsync(profileCookieKey(baseUrl))) ?? '';
    const session = await client.getSession();
    if (session.data?.user) {
      setUser({
        id: session.data.user.id,
        email: session.data.user.email,
        name: session.data.user.name,
      });
      setStatus('authenticated');
    } else {
      setUser(null);
      setStatus('needs-auth');
    }
  }, []);

  React.useEffect(() => {
    SecureStore.getItemAsync(INSTANCE_KEY)
      .then(async (stored) => {
        if (!stored) {
          setStatus('needs-instance');
          return;
        }
        const normalized = normalizeBaseUrl(stored);
        setInstanceUrl(normalized);
        await restoreSession(normalized);
      })
      .catch(() => {
        setError('Bòrd could not read the saved connection securely.');
        setStatus('needs-instance');
      });
  }, [restoreSession]);

  const configureInstance = React.useCallback(
    async (value: string) => {
      setError(null);
      const normalized = normalizeBaseUrl(value);
      const response = await fetch(`${normalized}/api/v1/health`, {
        headers: { Accept: 'application/json' },
      }).catch(() => null);
      if (!response) throw new Error('That Bòrd instance could not be reached.');
      if (!response.ok) throw new Error(await errorMessage(response));
      await SecureStore.setItemAsync(INSTANCE_KEY, normalized);
      setInstanceUrl(normalized);
      await restoreSession(normalized);
    },
    [restoreSession],
  );

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      if (!instanceUrl) throw new Error('Connect to a Bòrd instance first.');
      const client = createClient(instanceUrl);
      clientRef.current = client;
      if (!email.trim() || !password) throw new Error('Enter your email and passphrase.');
      setError(null);
      try {
        const result = await client.signIn.email({
          email: email.trim().toLowerCase(),
          password,
          rememberMe: true,
        });
        if (result.error) throw new Error(authFailureMessage(result.error, instanceUrl));
        const session = await client.getSession();
        if (session.error) throw new Error(authFailureMessage(session.error, instanceUrl));
        if (!session.data?.user) {
          throw new Error(
            'Bòrd accepted the credentials but did not establish a session. Restart the server and try again.',
          );
        }
        setUser({
          id: session.data.user.id,
          email: session.data.user.email,
          name: session.data.user.name,
        });
        setStatus('authenticated');
      } catch (signInError) {
        if (signInError instanceof Error && !/^fetch|network request/iu.test(signInError.message)) {
          throw signInError;
        }
        throw new Error(authFailureMessage(signInError, instanceUrl));
      }
    },
    [instanceUrl],
  );

  const requestPasswordReset = React.useCallback(
    async (email: string) => {
      if (!instanceUrl) throw new Error('Connect to a Bòrd instance first.');
      const client = clientRef.current ?? createClient(instanceUrl);
      clientRef.current = client;
      const result = await client.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${instanceUrl}/reset-password`,
      });
      if (result.error) throw new Error(authFailureMessage(result.error, instanceUrl));
    },
    [instanceUrl],
  );

  const recoverWithCode = React.useCallback(
    async (email: string, recoveryCode: string, newPassphrase: string) => {
      if (!instanceUrl) throw new Error('Connect to a Bòrd instance first.');
      const response = await fetch(`${instanceUrl}/api/v1/auth/recover`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: new URL(instanceUrl).origin,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          recoveryCode: recoveryCode.trim(),
          newPassphrase,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    },
    [instanceUrl],
  );

  const signOut = React.useCallback(async () => {
    await clientRef.current?.signOut();
    if (instanceUrl) await SecureStore.deleteItemAsync(profileCookieKey(instanceUrl));
    profileCookieRef.current = '';
    setUser(null);
    setStatus(instanceUrl ? 'needs-auth' : 'needs-instance');
  }, [instanceUrl]);

  const forgetInstance = React.useCallback(async () => {
    await clientRef.current?.signOut().catch(() => undefined);
    await SecureStore.deleteItemAsync(INSTANCE_KEY);
    if (instanceUrl) await SecureStore.deleteItemAsync(profileCookieKey(instanceUrl));
    profileCookieRef.current = '';
    clientRef.current = null;
    setInstanceUrl(null);
    setUser(null);
    setStatus('needs-instance');
  }, [instanceUrl]);

  const authenticatedFetch = React.useCallback(
    async (path: string, init: RequestInit = {}) => {
      const client = clientRef.current;
      if (!instanceUrl || !client) throw new Error('No Bòrd instance is connected.');
      const headers = new Headers(init.headers);
      if (!headers.has('Accept')) headers.set('Accept', 'application/json');
      const cookie = [client.getCookie(), profileCookieRef.current].filter(Boolean).join('; ');
      if (cookie) headers.set('Cookie', cookie);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
        headers.set('Origin', new URL(instanceUrl).origin);
      }
      const response = await fetch(`${instanceUrl}${path}`, {
        ...init,
        credentials: 'omit',
        headers,
      });
      const setCookie = response.headers.get('set-cookie') ?? '';
      const activeProfile = setCookie.match(/(?:^|,\s*)bord_active_profile=([^;]+)/u)?.[1];
      if (activeProfile) {
        profileCookieRef.current = `bord_active_profile=${activeProfile}`;
        await SecureStore.setItemAsync(profileCookieKey(instanceUrl), profileCookieRef.current);
      }
      if (response.status === 401) {
        setUser(null);
        setStatus('needs-auth');
      }
      if (!response.ok) throw new Error(await errorMessage(response));
      return response;
    },
    [instanceUrl],
  );

  const request = React.useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const response = await authenticatedFetch(path, init);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
    [authenticatedFetch],
  );

  const requestNdjson = React.useCallback(
    async <T,>(path: string) => {
      const response = await authenticatedFetch(path, {
        headers: { Accept: 'application/x-ndjson' },
      });
      const text = await response.text();
      return text
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { type?: string; data?: T })
        .flatMap((entry) => (entry.type === 'item' && entry.data != null ? [entry.data] : []));
    },
    [authenticatedFetch],
  );

  const requestEvents = React.useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const response = await authenticatedFetch(path, {
        ...init,
        headers: {
          Accept: 'application/x-ndjson',
          ...Object.fromEntries(new Headers(init.headers)),
        },
      });
      return (await response.text())
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T);
    },
    [authenticatedFetch],
  );

  const assetSource = React.useCallback(
    (path: string): ImageSourcePropType | undefined => {
      const client = clientRef.current;
      if (!instanceUrl || !client) return undefined;
      const cookie = [client.getCookie(), profileCookieRef.current].filter(Boolean).join('; ');
      return {
        uri: `${instanceUrl}${path}`,
        headers: cookie ? { Cookie: cookie } : undefined,
      };
    },
    [instanceUrl],
  );

  const value = React.useMemo(
    () => ({
      status,
      instanceUrl,
      user,
      error,
      configureInstance,
      signIn,
      requestPasswordReset,
      recoverWithCode,
      signOut,
      forgetInstance,
      request,
      requestNdjson,
      requestEvents,
      assetSource,
    }),
    [
      status,
      instanceUrl,
      user,
      error,
      configureInstance,
      signIn,
      requestPasswordReset,
      recoverWithCode,
      signOut,
      forgetInstance,
      request,
      requestNdjson,
      requestEvents,
      assetSource,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = React.use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
