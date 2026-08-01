import * as React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppHeader,
  BordMark,
  Body,
  Button,
  EditorialText,
  Eyebrow,
  FormField,
  Group,
  Screen,
  StatusPill,
  Surface,
} from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { useAuth } from '@/auth/auth-context';

export function InstanceScreen() {
  const { configureInstance } = useAuth();
  const [url, setUrl] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const connect = async () => {
    setPending(true);
    setError(null);
    try {
      await configureInstance(url);
      router.replace('/(auth)/sign-in');
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : 'That Bòrd instance could not be reached.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      eyebrow="CONNECT YOUR HOUSEHOLD"
      title="Where does your Bòrd live?"
      detail="Enter the full address you use for the Bòrd web app. Your server remains the source of truth."
    >
      <FormField
        label="Bòrd instance URL"
        value={url}
        onChangeText={setUrl}
        placeholder="https://recipes.example.com"
        autoCapitalize="none"
        keyboardType="url"
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[tokens.type.footnote, { color: tokens.color.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={pending ? 'Checking instance…' : 'Continue'}
        icon="network"
        disabled={pending}
        onPress={() => void connect()}
      />
      <Body muted>
        Local http addresses work in Expo Go on your home network. Use HTTPS before exposing Bòrd
        outside that network.
      </Body>
    </AuthCard>
  );
}

export function SignInScreen() {
  const { instanceUrl, signIn, forgetInstance } = useAuth();
  const [email, setEmail] = React.useState('');
  const [passphrase, setPassphrase] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const enter = async () => {
    setPending(true);
    setError(null);
    try {
      await signIn(email, passphrase);
      setPassphrase('');
      router.replace('/(app)/(recipes)');
    } catch (connectionError) {
      setError(
        connectionError instanceof Error ? connectionError.message : 'Sign-in could not start.',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Screen
      style={{ flexGrow: 1, justifyContent: 'center', backgroundColor: tokens.color.paperMuted }}
    >
      <View style={{ alignItems: 'center', gap: tokens.space.lg }}>
        <BordMark />
        <Surface
          elevated
          style={{ width: '100%', maxWidth: 440, padding: tokens.space.lg, gap: tokens.space.md }}
        >
          <View style={{ gap: 5 }}>
            <Eyebrow>HOUSEHOLD SIGN-IN</Eyebrow>
            <EditorialText variant="title">Welcome back.</EditorialText>
            <Body muted>Use your Bòrd email and full passphrase.</Body>
            <StatusPill>{instanceUrl ? new URL(instanceUrl).host : 'Bòrd instance'}</StatusPill>
          </View>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <FormField
            label="Passphrase"
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            placeholder="Enter your passphrase"
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <Body muted>
            Your encrypted session is kept in the device keychain or Android Keystore. Your
            passphrase is never saved.
          </Body>
          {error ? (
            <Text
              selectable
              accessibilityRole="alert"
              style={[tokens.type.footnote, { color: tokens.color.danger }]}
            >
              {error}
            </Text>
          ) : null}
          <Button
            label={pending ? 'Signing in…' : 'Sign in'}
            disabled={pending}
            onPress={() => void enter()}
          />
          <Button
            label="Forgot your passphrase?"
            tone="quiet"
            onPress={() => router.push('/forgot-password')}
          />
          <Button
            label="Use a different Bòrd instance"
            tone="quiet"
            icon="network"
            onPress={() => void forgetInstance().then(() => router.replace('/(auth)/instance'))}
          />
        </Surface>
      </View>
    </Screen>
  );
}
export function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => {
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The reset could not start.');
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your passphrase."
      detail="We will send a one-time reset link if the email belongs to a profile."
    >
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {sent ? <StatusPill>Check your email</StatusPill> : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[tokens.type.footnote, { color: tokens.color.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={pending ? 'Requesting…' : 'Send reset link'}
        disabled={pending}
        onPress={() => void submit()}
      />
      <Button
        label="Use a local recovery code"
        tone="quiet"
        onPress={() => router.push('/reset-password')}
      />
    </AuthCard>
  );
}
export function ResetPasswordScreen() {
  const { recoverWithCode } = useAuth();
  const [email, setEmail] = React.useState('');
  const [recoveryCode, setRecoveryCode] = React.useState('');
  const [passphrase, setPassphrase] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => {
    if (passphrase.length < 15) {
      setError('Use a passphrase with at least 15 characters.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await recoverWithCode(email, recoveryCode, passphrase);
      router.replace('/sign-in');
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error ? recoveryError.message : 'The passphrase was not reset.',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard
      eyebrow="LOCAL RECOVERY"
      title="Choose a new passphrase."
      detail="Enter one unused recovery code for this profile."
    >
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField
        label="Recovery code"
        value={recoveryCode}
        onChangeText={setRecoveryCode}
        placeholder="BORD-XXXX-XXXX-XXXX"
      />
      <FormField
        label="New passphrase"
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        placeholder="At least 15 characters"
      />
      <View
        style={{
          height: 4,
          backgroundColor: passphrase.length > 14 ? tokens.color.olive : tokens.color.separator,
          borderRadius: 2,
        }}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[tokens.type.footnote, { color: tokens.color.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={pending ? 'Resetting…' : 'Reset passphrase'}
        disabled={pending}
        onPress={() => void submit()}
      />
    </AuthCard>
  );
}
function AuthCard({
  eyebrow,
  title,
  detail,
  children,
}: React.PropsWithChildren<{ eyebrow: string; title: string; detail: string }>) {
  return (
    <Screen
      style={{ flexGrow: 1, justifyContent: 'center', backgroundColor: tokens.color.paperMuted }}
    >
      <View style={{ alignItems: 'center', gap: tokens.space.lg }}>
        <BordMark />
        <Surface
          elevated
          style={{ width: '100%', maxWidth: 440, padding: tokens.space.lg, gap: tokens.space.md }}
        >
          <View style={{ gap: 5 }}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <EditorialText variant="title">{title}</EditorialText>
            <Body muted>{detail}</Body>
          </View>
          {children}
        </Surface>
      </View>
    </Screen>
  );
}
export function SecurityScreen() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <AppHeader back />
      <View style={{ gap: 6 }}>
        <Eyebrow>SECURITY</Eyebrow>
        <EditorialText variant="title">Account security</EditorialText>
        <Body muted>Review how this device protects your Bòrd session.</Body>
      </View>
      <Surface elevated style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={[tokens.type.footnote, { fontWeight: '800', color: tokens.color.ink }]}
          >
            Session protected
          </Text>
          <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            Credentials are stored by the iOS Keychain or Android Keystore.
          </Text>
        </View>
        <StatusPill>Protected</StatusPill>
      </Surface>
      <Group title="THIS DEVICE">
        <View style={{ padding: tokens.space.md, gap: 3 }}>
          <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
            {user?.email ?? 'Signed-in account'}
          </Text>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            The app keeps the session token securely and never stores your passphrase.
          </Text>
        </View>
      </Group>
      <Surface>
        <Body muted>
          Expo Go uses the device passcode when the operating system protects its secure storage.
          Biometric app locking requires a development build.
        </Body>
      </Surface>
      <Button
        label="Sign out on this device"
        tone="danger"
        onPress={() => void signOut().then(() => router.replace('/(auth)/sign-in'))}
      />
    </Screen>
  );
}
