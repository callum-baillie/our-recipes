import * as React from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Body,
  Button,
  Divider,
  EditorialText,
  Eyebrow,
  FormField,
  Group,
  Icon,
  IconButton,
  NativeToggle,
  Screen,
  StatusPill,
  Surface,
} from '@/components/ui';
import { SwiftToggle } from '@/components/swift-toggle';
import { useBord } from '@/state/bord-store';
import { tokens } from '@/theme/tokens';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SettingsScreenKey =
  | 'profiles'
  | 'recipes'
  | 'meal-plan'
  | 'lists'
  | 'pantry'
  | 'nutrition'
  | 'ai'
  | 'system'
  | 'backups'
  | 'api';
const titles: Record<SettingsScreenKey, string> = {
  profiles: 'Profiles & roles',
  recipes: 'Recipe settings',
  'meal-plan': 'Meal plan settings',
  lists: 'List settings',
  pantry: 'Pantry settings',
  nutrition: 'Nutrition settings',
  ai: 'AI settings',
  system: 'System settings',
  backups: 'Backups',
  api: 'API & integrations',
};
const details: Record<SettingsScreenKey, string> = {
  profiles: 'Make the app feel right for each person.',
  recipes: 'Set up the cookbook for everyday use.',
  'meal-plan': 'Start every plan with the right shape.',
  lists: 'Choose how lists behave and match the store you walk.',
  pantry: 'Open Pantry on the stock that matters.',
  nutrition: 'Set goals and optional inputs for this profile.',
  ai: 'Control what the assistant uses and what it may prepare.',
  system: 'Your kitchen, backed by Bòrd.',
  backups: 'Keep the household cookbook recoverable.',
  api: 'Private integrations, with an explicit boundary.',
};
export function SettingsScreen({ basePath = '/settings' }: { basePath?: '/settings' }) {
  const { user } = useAuth();
  const displayName = user?.name?.trim() || user?.email || 'Bòrd account';
  const initial = displayName.slice(0, 1).toUpperCase();
  const items: [SettingsScreenKey, string, string][] = [
    ['profiles', 'person.2', 'People, roles, units, and permissions'],
    ['recipes', 'books.vertical', 'Library defaults and new recipes'],
    ['meal-plan', 'calendar', 'Week, meals, and generation defaults'],
    ['lists', 'list.bullet', 'Stores, completion, and aisle order'],
    ['pantry', 'shippingbox', 'Stock view, grouping, and reminders'],
    ['nutrition', 'target', 'Profile-specific goals and inputs'],
    ['ai', 'sparkles', 'Permissions and confirmation behavior'],
    ['system', 'gearshape', 'Appearance, accessibility, and recovery'],
    ['backups', 'icloud', 'Automatic policy and manual recovery'],
    ['api', 'key', 'Scoped keys and trusted integrations'],
  ];
  return (
    <Screen>
      <SettingsHeader
        eyebrow="YOUR KITCHEN, YOUR WAY"
        title="Settings"
        detail="Manage shared household behavior and profile-specific preferences."
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open profile settings for ${displayName}`}
        onPress={() => router.push(`${basePath}/profiles` as Href)}
      >
        <Surface elevated style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: tokens.color.teal,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={[tokens.type.headline, { color: tokens.color.inverse, fontWeight: '800' }]}
            >
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <EditorialText variant="section">{displayName}</EditorialText>
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              Signed in · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </Text>
          </View>
          <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
        </Surface>
      </Pressable>
      <Group title="HOUSEHOLD">
        {items.slice(0, 6).map(([key, icon, detail], index) => (
          <SettingsRow
            key={key}
            title={titles[key]}
            detail={detail}
            icon={icon}
            onPress={() => router.push(`${basePath}/${key}` as Href)}
            bordered={Boolean(index)}
          />
        ))}
      </Group>
      <Group title="APP SETTINGS">
        <SettingsRow
          title="Web app connection"
          detail="Server URL, account sign-in, or scoped API key"
          icon="network"
          onPress={() => router.push(`${basePath}/api` as Href)}
        />
      </Group>
      <Group title="APP & SECURITY">
        {items.slice(6, 9).map(([key, icon, detail], index) => (
          <SettingsRow
            key={key}
            title={titles[key]}
            detail={detail}
            icon={icon}
            onPress={() => router.push(`${basePath}/${key}` as Href)}
            bordered={Boolean(index)}
          />
        ))}
        <SettingsRow
          title="Account security"
          detail="Passkeys, recovery codes, and devices"
          icon="lock.shield"
          onPress={() => router.push('/security')}
          bordered
        />
      </Group>
    </Screen>
  );
}
function SettingsRow({
  title,
  detail,
  icon,
  onPress,
  bordered = false,
}: {
  title: string;
  detail: string;
  icon: string;
  onPress: () => void;
  bordered?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 66,
          padding: tokens.space.sm,
          borderTopWidth: bordered ? 1 : 0,
          borderColor: tokens.color.separator,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space.sm,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: tokens.color.sage,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} fallback="•" color={tokens.color.olive} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'Georgia',
            fontSize: 18,
            lineHeight: 19,
            fontWeight: '700',
            color: tokens.color.ink,
          }}
        >
          {title}
        </Text>
        <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>{detail}</Text>
      </View>
      <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
    </Pressable>
  );
}
export function SettingsDetailScreen({ screen }: { screen: SettingsScreenKey }) {
  const { state, dispatch } = useBord();
  const { user } = useAuth();
  const toggle = (key: string) => (value: boolean) => dispatch({ type: 'set-setting', key, value });
  const bool = (key: string) => Boolean(state.settings[key]);
  const configuration: Record<
    SettingsScreenKey,
    { section: string; rows: { label: string; hint?: string; key: string }[] }
  > = {
    profiles: {
      section: 'PROFILE PREFERENCES',
      rows: [
        { label: 'Use household units', hint: 'US customary', key: 'profiles.units.enabled' },
        { label: 'Show profile reminders', key: 'profiles.reminders' },
      ],
    },
    recipes: {
      section: 'COOK MODE',
      rows: [
        {
          label: 'Keep screen awake',
          hint: 'While a cooking step is open',
          key: 'recipe.keepAwake',
        },
        { label: 'Haptic step confirmations', key: 'recipe.haptics' },
        { label: 'Offer generated cover images', key: 'recipe.coverImages' },
      ],
    },
    'meal-plan': {
      section: 'GENERATION',
      rows: [
        {
          label: 'Use pantry availability',
          hint: 'Prefer ingredients already on hand',
          key: 'plan.usePantry',
        },
        { label: 'Protect manual changes', key: 'plan.protectManual' },
      ],
    },
    lists: {
      section: 'GENERAL',
      rows: [
        {
          label: 'Open pantry intake',
          hint: 'Record purchased quantities',
          key: 'lists.openPantryIntake',
        },
        { label: 'Keep list open after shopping', key: 'lists.keepOpen' },
      ],
    },
    pantry: {
      section: 'REMINDERS',
      rows: [
        { label: 'Expiry reminders', hint: 'Alert two days before', key: 'pantry.expiry' },
        { label: 'Low-stock reminders', key: 'pantry.lowStock' },
        { label: 'Opened-item tracking', key: 'pantry.openedTracking' },
      ],
    },
    nutrition: {
      section: 'OPTIONAL INPUTS',
      rows: [
        {
          label: 'Body measurements',
          hint: 'Used only for personalized estimates',
          key: 'nutrition.measurements',
        },
        { label: 'Pregnancy or breastfeeding', key: 'nutrition.pregnancy' },
      ],
    },
    ai: {
      section: 'ASSISTANT PERMISSIONS',
      rows: [
        {
          label: 'Enable Kitchen Assistant',
          hint: 'Allow assistant requests from this device',
          key: 'ai.enabled',
        },
        { label: 'Read recipes', hint: 'Titles, ingredients, and methods', key: 'ai.readRecipes' },
        { label: 'Read pantry', key: 'ai.readPantry' },
        { label: 'Read meal plan', key: 'ai.readPlan' },
        { label: 'Read nutrition', hint: 'Planned summaries only', key: 'ai.readNutrition' },
        {
          label: 'Prepare changes',
          hint: 'Always requires review before saving',
          key: 'ai.confirm',
        },
      ],
    },
    system: {
      section: 'APPEARANCE',
      rows: [
        {
          label: 'Reduce decorative motion',
          hint: 'Uses system accessibility setting',
          key: 'system.reduceMotion',
        },
      ],
    },
    backups: {
      section: 'AUTOMATIC BACKUPS',
      rows: [
        {
          label: 'Automatic backups',
          hint: 'Daily when on Wi-Fi and power',
          key: 'backup.automatic',
        },
        { label: 'Include recipe images', hint: 'Adds about 184 MB', key: 'backup.images' },
      ],
    },
    api: {
      section: 'SECURITY',
      rows: [
        {
          label: 'Require passphrase to create keys',
          hint: 'Admin-only action',
          key: 'api.requirePassphrase',
        },
      ],
    },
  };
  const config = configuration[screen];
  return (
    <Screen>
      <SettingsHeader
        eyebrow={
          screen === 'ai'
            ? 'KITCHEN ASSISTANT'
            : screen === 'api'
              ? 'API & SECURITY'
              : screen === 'backups'
                ? 'DATA PROTECTION'
                : 'SETTINGS'
        }
        title={titles[screen]}
        detail={details[screen]}
      />
      {screen === 'profiles' ? <ProfileContent user={user} /> : null}
      {screen === 'nutrition' ? <NutritionGoals /> : null}
      {screen === 'system' ? <SystemContent /> : null}
      {screen === 'backups' ? <BackupContent /> : null}
      {screen === 'api' ? <ApiContent /> : null}
      {screen === 'ai' ? (
        <AssistantNameSetting
          value={
            typeof state.settings['ai.name'] === 'string' && state.settings['ai.name'].trim()
              ? state.settings['ai.name']
              : "Chef's Assistant"
          }
          onChange={(value) =>
            dispatch({ type: 'set-setting', key: 'ai.name', value: value.slice(0, 40) })
          }
        />
      ) : null}
      <Group title={config.section}>
        {config.rows.map((row, index) => (
          <View key={row.key}>
            {index ? <Divider /> : null}
            {screen === 'recipes' && row.key === 'recipe.keepAwake' ? (
              <SwiftToggle label={row.label} value={bool(row.key)} onChange={toggle(row.key)} />
            ) : (
              <NativeToggle
                label={row.label}
                hint={row.hint}
                value={bool(row.key)}
                onChange={toggle(row.key)}
              />
            )}
          </View>
        ))}
      </Group>
      {screen === 'meal-plan' ? <PlannerExtras /> : null}
      {screen === 'lists' ? <ListExtras /> : null}
      {screen === 'pantry' ? <PantryExtras /> : null}
      {screen === 'ai' ? (
        <Surface style={{ backgroundColor: tokens.color.sage }}>
          <Body>
            Changes prepared by the assistant always stay as a reviewable proposal before they touch
            your household data.
          </Body>
        </Surface>
      ) : null}
    </Screen>
  );
}

function AssistantNameSetting({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Group title="ASSISTANT IDENTITY">
      <View style={{ padding: tokens.space.md, gap: tokens.space.xs }}>
        <FormField
          label="Assistant name"
          value={value}
          onChangeText={onChange}
          placeholder="Chef's Assistant"
          autoCapitalize="words"
        />
        <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
          This name appears at the top of the assistant sheet on this device.
        </Text>
      </View>
    </Group>
  );
}

function SettingsHeader({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        marginTop: -tokens.layout.page,
        marginHorizontal: -tokens.layout.page,
        paddingTop: insets.top + tokens.space.sm,
        paddingHorizontal: tokens.layout.page,
        paddingBottom: tokens.space.md,
        backgroundColor: tokens.color.paper,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.separator,
        gap: tokens.space.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs }}>
        <IconButton
          label="Back"
          icon="chevron.left"
          fallback="‹"
          appearance="plain"
          onPress={() => router.back()}
        />
        <View style={{ flex: 1 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <EditorialText variant="title">{title}</EditorialText>
        </View>
      </View>
      <Body muted>{detail}</Body>
    </View>
  );
}
function ProfileContent({ user }: { user: { id: string; email: string; name: string } | null }) {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState('');
  const [switching, setSwitching] = React.useState(false);
  const displayName = user?.name?.trim() || user?.email || 'Bòrd account';
  const switchProfile = async () => {
    if (!selectedId || pin.length !== 6) return;
    setSwitching(true);
    try {
      await request(`/api/v1/profiles/${encodeURIComponent(selectedId)}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ pin }),
      });
      await refresh();
      setSelectedId(null);
      setPin('');
    } catch (error) {
      Alert.alert('Profile not switched', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSwitching(false);
    }
  };
  return (
    <>
      <Surface elevated style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: tokens.color.teal,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[tokens.type.headline, { color: tokens.color.inverse, fontWeight: '800' }]}>
            {displayName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow>ACTIVE PROFILE</Eyebrow>
          <EditorialText variant="section">{displayName}</EditorialText>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            {user?.email ?? 'No active account'}
          </Text>
        </View>
        <StatusPill>Account</StatusPill>
      </Surface>
      <Group title="HOUSEHOLD PROFILES">
        {state.profiles.map((profile, index) => (
          <React.Fragment key={profile.id}>
            {index ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${profile.displayName}`}
              onPress={() => {
                setSelectedId(profile.id);
                setPin('');
              }}
              style={({ pressed }) => ({
                minHeight: 62,
                padding: tokens.space.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.space.sm,
                backgroundColor: pressed ? tokens.color.sage : tokens.color.surface,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: profile.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={[tokens.type.footnote, { color: tokens.color.inverse, fontWeight: '800' }]}
                >
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}
                >
                  {profile.displayName}
                </Text>
                <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                  {profile.units} · {profile.temperatureUnit} · {profile.timezone}
                </Text>
              </View>
              <Icon name="chevron.right" color={tokens.color.inkSecondary} />
            </Pressable>
          </React.Fragment>
        ))}
      </Group>
      {selectedId ? (
        <Surface elevated>
          <EditorialText variant="section">Enter profile PIN</EditorialText>
          <Body muted>
            Six-digit profile PINs provide convenient switching. They do not replace account
            authentication.
          </Body>
          <FormField
            label="Profile PIN"
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/gu, '').slice(0, 6))}
            secureTextEntry
            keyboardType="number-pad"
            textContentType="oneTimeCode"
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="secondary" onPress={() => setSelectedId(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={switching ? 'Switching…' : 'Switch profile'}
                disabled={switching || pin.length !== 6}
                onPress={() => void switchProfile()}
              />
            </View>
          </View>
        </Surface>
      ) : null}
      <Surface>
        <Body muted>
          Household profiles are conveniences for attribution and preferences; your signed-in
          account remains the access boundary.
        </Body>
      </Surface>
    </>
  );
}
function NutritionGoals() {
  return (
    <Surface>
      <Eyebrow>NUTRITION GOALS</Eyebrow>
      <Body muted>
        Personal targets remain server-owned. Pull to refresh after changing them in the connected
        web app.
      </Body>
    </Surface>
  );
}
function Goal({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        minHeight: 50,
        padding: tokens.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Text style={[tokens.type.footnote, { flex: 1, color: tokens.color.ink, fontWeight: '800' }]}>
        {label}
      </Text>
      <Text
        style={[
          tokens.type.caption,
          { color: tokens.color.inkSecondary, fontVariant: ['tabular-nums'] },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
function SystemContent() {
  return (
    <Group title="KITCHEN IDENTITY">
      <Goal label="Kitchen name" value="Bòrd" />
      <Divider />
      <Goal label="Theme" value="System" />
      <Divider />
      <Goal label="Accent color" value="Forest green" />
    </Group>
  );
}
function BackupContent() {
  const { request, signOut } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [backups, setBackups] = React.useState<{ id: string; createdAt: string; bytes: number }[]>(
    [],
  );
  const [restoreId, setRestoreId] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState('');
  const load = React.useCallback(async () => {
    const result = await request<{ backups: { id: string; createdAt: string; bytes: number }[] }>(
      '/api/v1/backups',
    );
    setBackups(result.backups);
  }, [request]);
  React.useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  const createBackup = async () => {
    setBusy(true);
    try {
      await request('/api/v1/backups', { method: 'POST' });
      await load();
      Alert.alert('Backup created', 'The server created a new manual backup.');
    } catch (error) {
      Alert.alert('Backup not created', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!restoreId || confirmation !== 'RESTORE') return;
    setBusy(true);
    try {
      await request(`/api/v1/backups/${encodeURIComponent(restoreId)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      });
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      Alert.alert('Backup not restored', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Surface elevated style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            backgroundColor: tokens.color.sage,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon name="icloud" fallback="☁" color={tokens.color.olive} size={26} />
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow>BACKUP HEALTH</Eyebrow>
          <EditorialText variant="section">Server managed</EditorialText>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            Review retention, size, and restore points on the connected server.
          </Text>
        </View>
        <StatusPill>Connected</StatusPill>
      </Surface>
      <Group title="MANUAL ACTIONS">
        <SettingsRow
          title="Back up now"
          detail="Creates a new encrypted snapshot"
          icon="arrow.up.icloud"
          onPress={() => void createBackup()}
        />
        {backups.map((backup, index) => (
          <SettingsRow
            key={backup.id}
            title={new Date(backup.createdAt).toLocaleString()}
            detail={`${(backup.bytes / 1_048_576).toFixed(1)} MB · tap to review restore`}
            icon="archivebox"
            onPress={() => {
              setRestoreId(backup.id);
              setConfirmation('');
            }}
            bordered={index > 0}
          />
        ))}
      </Group>
      {restoreId ? (
        <Surface elevated>
          <Eyebrow>DESTRUCTIVE RESTORE</Eyebrow>
          <EditorialText variant="section">Replace household data?</EditorialText>
          <Body muted>
            Bòrd creates a safety backup first, then restores this snapshot and signs every device
            out. Type RESTORE to continue.
          </Body>
          <FormField
            label="Confirmation"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="secondary" onPress={() => setRestoreId(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Restore backup"
                tone="danger"
                disabled={busy || confirmation !== 'RESTORE'}
                onPress={() => void restore()}
              />
            </View>
          </View>
        </Surface>
      ) : null}
      {busy ? <Body muted>Creating backup…</Body> : null}
    </>
  );
}
function ApiContent() {
  const { instanceUrl, user, signOut, forgetInstance } = useAuth();
  const { refreshing, lastSyncedAt, error, refresh } = useSync();
  const openApiSettings = () => {
    if (instanceUrl) void Linking.openURL(`${instanceUrl}/settings/api`);
  };

  return (
    <>
      <Group title="APP CONNECTION">
        <View style={{ padding: tokens.space.md, gap: tokens.space.md }}>
          <Goal label="Instance" value={instanceUrl ?? 'Not connected'} />
          <Divider />
          <Goal label="Signed in as" value={user?.email ?? 'No active session'} />
          <Divider />
          <Goal
            label="Last server refresh"
            value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not yet refreshed'}
          />
          <Button
            label={refreshing ? 'Refreshing…' : 'Refresh server cache now'}
            icon="arrow.counterclockwise"
            disabled={refreshing}
            onPress={() => void refresh()}
          />
          <Button
            label="Sign out"
            tone="secondary"
            icon="person.crop.circle"
            onPress={() => void signOut().then(() => router.replace('/(auth)/sign-in'))}
          />
          <Button
            label="Change Bòrd instance"
            tone="danger"
            icon="network"
            onPress={() =>
              Alert.alert(
                'Change Bòrd instance?',
                'The current secure session will be signed out. The local read cache remains until the next instance refresh replaces it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Change',
                    style: 'destructive',
                    onPress: () =>
                      void forgetInstance().then(() => router.replace('/(auth)/instance')),
                  },
                ],
              )
            }
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[tokens.type.footnote, { color: tokens.color.danger }]}
            >
              {error}
            </Text>
          ) : null}
        </View>
      </Group>
      <Surface style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Icon name="checkmark.shield" fallback="✓" color={tokens.color.olive} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
            Session credentials stay protected
          </Text>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            Bòrd stores the native session in SecureStore and never saves your passphrase.
          </Text>
        </View>
      </Surface>
      <Group title="API KEYS">
        <View style={{ padding: tokens.space.md, gap: tokens.space.sm }}>
          <Body muted>
            Scoped keys stay on the server and are never copied into the mobile cache.
          </Body>
          <Button
            label="Manage API keys on Bòrd"
            tone="secondary"
            icon="key"
            onPress={openApiSettings}
          />
        </View>
      </Group>
      <Group title="TRUSTED INTEGRATIONS">
        <View style={{ padding: tokens.space.md }}>
          <Body muted>
            Provider status and credentials are read and changed only in the connected web app.
          </Body>
        </View>
      </Group>
    </>
  );
}
function PlannerExtras() {
  return (
    <Group title="MEALS SHOWN">
      <View style={{ padding: tokens.space.md, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((meal) => (
          <StatusPill key={meal}>{meal}</StatusPill>
        ))}
      </View>
    </Group>
  );
}
function ListExtras() {
  return (
    <Group title="SUPERMARKET AISLES">
      {['Fresh produce', 'Bakery', 'Meat & seafood', 'Dairy & eggs'].map((aisle, index) => (
        <View key={aisle}>
          {index ? <Divider /> : null}
          <Goal label={`${index + 1} · ${aisle}`} value="↕" />
        </View>
      ))}
    </Group>
  );
}
function PantryExtras() {
  return (
    <Group title="QUICK ADD">
      <Goal label="Default location" value="Pantry" />
      <Divider />
      <Goal label="Default grouping" value="Location" />
    </Group>
  );
}
