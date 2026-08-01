import * as React from 'react';
import {
  ActionSheetIOS,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router, usePathname, useSegments, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens, editorial } from '@/theme/tokens';
import { useSync } from '@/sync/sync-context';
import { BordLogo } from '@/components/bord-logo';
import { useAuth } from '@/auth/auth-context';

const isIOS = Platform.OS === 'ios';
const materialIconNames: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  'arrow.counterclockwise': 'history',
  'arrow.down': 'arrow-down',
  'arrow.down.circle': 'arrow-down-circle-outline',
  'arrow.up': 'arrow-up',
  'arrow.up.icloud': 'cloud-upload-outline',
  'arrow.triangle.2.circlepath': 'sync',
  archivebox: 'archive-outline',
  'barcode.viewfinder': 'barcode-scan',
  'books.vertical': 'book-open-page-variant',
  calendar: 'calendar-month',
  camera: 'camera-outline',
  'chart.pie': 'chart-pie',
  checkmark: 'check',
  'chevron.down': 'chevron-down',
  'checkmark.icloud': 'cloud-check-outline',
  'checkmark.seal': 'check-decagram-outline',
  'checkmark.shield': 'shield-check-outline',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'chevron.up': 'chevron-up',
  circle: 'circle-outline',
  clock: 'clock-outline',
  doc: 'file-document-outline',
  'doc.on.doc': 'content-copy',
  'doc.text': 'file-document-outline',
  'doc.text.magnifyingglass': 'file-search-outline',
  drop: 'water-outline',
  ellipsis: 'dots-horizontal',
  flame: 'fire',
  folder: 'folder-outline',
  'ellipsis.circle': 'dots-horizontal-circle-outline',
  'fork.knife': 'silverware-fork-knife',
  'frying.pan': 'pot-outline',
  gearshape: 'cog-outline',
  heart: 'heart-outline',
  'heart.fill': 'heart',
  icloud: 'cloud-outline',
  key: 'key-outline',
  leaf: 'leaf',
  link: 'link-variant',
  'list.bullet': 'format-list-bulleted',
  'list.bullet.clipboard': 'clipboard-list-outline',
  'lock.shield': 'shield-lock-outline',
  magnifyingglass: 'magnify',
  map: 'map-outline',
  knife: 'knife',
  mic: 'microphone-outline',
  network: 'lan-connect',
  pencil: 'pencil-outline',
  person: 'account-outline',
  'person.2': 'account-multiple-outline',
  'person.crop.circle': 'account-circle-outline',
  photo: 'image-outline',
  plus: 'plus',
  'rectangle.portrait.and.arrow.right': 'logout',
  oven: 'stove',
  'pot-steam': 'pot-steam-outline',
  shippingbox: 'archive-outline',
  snow: 'snowflake',
  sparkles: 'creation-outline',
  'square.and.arrow.down': 'tray-arrow-down',
  'slider.horizontal.3': 'tune-variant',
  target: 'target',
  timer: 'timer-outline',
  trash: 'trash-can-outline',
  xmark: 'close',
  'xmark.circle': 'close-circle-outline',
  'wifi.slash': 'wifi-off',
};
export function Icon({
  name,
  fallback = '•',
  color = tokens.color.ink,
  size = 20,
}: {
  name: string;
  fallback?: string;
  color?: string;
  size?: number;
}) {
  if (isIOS)
    return (
      <SymbolView
        name={name as SymbolViewProps['name']}
        size={size}
        tintColor={color}
        fallback={
          <MaterialCommunityIcons
            name={materialIconNames[name] ?? 'circle-outline'}
            size={size}
            color={color}
          />
        }
      />
    );
  const materialName = materialIconNames[name];
  return materialName ? (
    <MaterialCommunityIcons name={materialName} size={size} color={color} />
  ) : (
    <Text style={{ color, fontSize: size, lineHeight: size, fontWeight: '700' }}>{fallback}</Text>
  );
}
export function BordMark({ compact = false }: { compact?: boolean }) {
  return <BordLogo compact={compact} />;
}
export function EditorialText({
  children,
  variant = 'section',
  style,
}: React.PropsWithChildren<{ variant?: 'display' | 'title' | 'section'; style?: TextStyle }>) {
  return (
    <Text selectable style={[editorial, tokens.type[variant], { color: tokens.color.ink }, style]}>
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: React.PropsWithChildren) {
  return (
    <Text selectable style={[tokens.type.eyebrow, { color: tokens.color.olive }]}>
      {children}
    </Text>
  );
}
export function Body({
  children,
  muted = false,
  style,
}: React.PropsWithChildren<{ muted?: boolean; style?: TextStyle }>) {
  return (
    <Text
      selectable
      style={[
        tokens.type.callout,
        { color: muted ? tokens.color.inkSecondary : tokens.color.ink },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Screen({
  children,
  scroll = true,
  style,
  header = false,
}: React.PropsWithChildren<{
  scroll?: boolean;
  style?: ViewStyle;
  header?: false | 'root' | 'back';
}>) {
  const { refreshing, refresh } = useSync();
  const bottomInset = useBottomContentInset();
  const items = React.Children.toArray(children);
  const first = items[0];
  const nestedHeader = React.isValidElement(first) && first.type === AppHeader ? first : null;
  const fixedHeader = nestedHeader ?? (header ? <AppHeader back={header === 'back'} /> : null);
  const content = nestedHeader ? items.slice(1) : items;
  if (!scroll)
    return (
      <View style={[{ flex: 1, backgroundColor: tokens.color.paper }, style]}>
        {fixedHeader}
        {content}
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      {fixedHeader}
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets={isIOS}
        keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        contentContainerStyle={[
          {
            padding: tokens.layout.page,
            paddingBottom: bottomInset,
            gap: tokens.space.lg,
            alignSelf: 'center',
            width: '100%',
            maxWidth: tokens.layout.maxWidth,
          },
          style,
        ]}
        style={{ flex: 1, backgroundColor: tokens.color.paper }}
      >
        {content}
      </ScrollView>
    </View>
  );
}
export function useBottomContentInset(extra = 0) {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const isInsideTabs = segments.includes('(app)');
  return tokens.space.xxl + insets.bottom + (isInsideTabs ? 64 : 0) + extra;
}
export function AppHeader({
  back = false,
  assistant = true,
  title,
  actions,
  variant = 'paper',
}: {
  back?: boolean;
  assistant?: boolean;
  title?: string;
  actions?: React.ReactNode;
  variant?: 'paper' | 'dark';
}) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const homeHref = (
    segments.includes('(plan)')
      ? '/(app)/(plan)/home'
      : segments.includes('(pantry)')
        ? '/(app)/(pantry)/home'
        : segments.includes('(nutrition)')
          ? '/(app)/(nutrition)/home'
          : segments.includes('(lists)')
            ? '/(app)/(lists)/home'
            : '/(app)/(recipes)/home'
  ) as Href;
  const routeAction =
    actions ??
    (pathname === '/pantry' || title === 'Pantry' ? (
      <IconButton
        label="Scan pantry item"
        icon="barcode.viewfinder"
        appearance="plain"
        onPress={() => router.push('/scanner?target=pantry')}
      />
    ) : pathname === '/recipes' || title === 'Recipes' ? (
      <IconButton
        label="New recipe"
        icon="plus"
        onPress={() => router.push('/(app)/(recipes)/new')}
      />
    ) : null);
  return (
    <View
      style={{
        minHeight: 58 + insets.top,
        paddingTop: insets.top,
        paddingHorizontal: tokens.layout.page,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.xs,
        backgroundColor: variant === 'dark' ? tokens.color.dark : tokens.color.paper,
        borderBottomWidth: 1,
        borderBottomColor: variant === 'dark' ? tokens.color.olivePressed : tokens.color.separator,
        zIndex: 20,
      }}
    >
      <View style={{ width: 54, alignItems: 'flex-start' }}>
        {back ? (
          <IconButton
            label="Back"
            icon="chevron.left"
            fallback="‹"
            appearance="plain"
            color={variant === 'dark' ? tokens.color.inverse : tokens.color.ink}
            onPress={() => router.back()}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Home"
            hitSlop={8}
            onPress={() => router.push(homeHref)}
            style={({ pressed }) => ({
              minWidth: 56,
              minHeight: tokens.layout.touch,
              alignItems: 'flex-start',
              justifyContent: 'center',
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <BordMark compact />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        {routeAction}
        {assistant ? (
          <IconButton
            label="Kitchen assistant"
            icon="sparkles"
            fallback="✦"
            appearance="plain"
            color={variant === 'dark' ? tokens.color.inverse : tokens.color.ink}
            onPress={() => router.push('/assistant')}
          />
        ) : null}
        <ProfileMenu variant={variant} />
      </View>
    </View>
  );
}
function ProfileMenu({ variant }: { variant: 'paper' | 'dark' }) {
  const { user, signOut } = useAuth();
  const [expanded, setExpanded] = React.useState(false);
  const initial = (user?.name?.trim() || user?.email || 'B').slice(0, 1).toUpperCase();
  const navigate = (
    path: '/settings' | '/settings/profiles' | '/security' | '/settings/backups' | '/settings/api',
  ) => {
    setExpanded(false);
    router.push(path);
  };
  const open = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: user?.name?.trim() || user?.email || 'Bòrd account',
          options: [
            'Settings',
            'Profiles & roles',
            'Account security',
            'Backups',
            'API & integrations',
            'Sign out',
            'Cancel',
          ],
          destructiveButtonIndex: 5,
          cancelButtonIndex: 6,
        },
        (index) => {
          if (index === 0) navigate('/settings');
          if (index === 1) navigate('/settings/profiles');
          if (index === 2) navigate('/security');
          if (index === 3) navigate('/settings/backups');
          if (index === 4) navigate('/settings/api');
          if (index === 5) void signOut().then(() => router.replace('/(auth)/sign-in'));
        },
      );
      return;
    }
    setExpanded((current) => !current);
  };
  const entries = [
    ['Settings', 'gearshape', '/settings'],
    ['Profiles & roles', 'person.2', '/settings/profiles'],
    ['Account security', 'lock.shield', '/security'],
    ['Backups', 'icloud', '/settings/backups'],
    ['API & integrations', 'key', '/settings/api'],
  ] as const;
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
        onPress={open}
        style={({ pressed }) => ({
          width: tokens.layout.touch,
          height: tokens.layout.touch,
          borderRadius: tokens.layout.touch / 2,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: variant === 'dark' ? tokens.color.sageStrong : tokens.color.teal,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={[
              tokens.type.caption,
              {
                color: variant === 'dark' ? tokens.color.dark : tokens.color.inverse,
                fontWeight: '900',
              },
            ]}
          >
            {initial}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <View
          accessibilityRole="menu"
          style={{
            position: 'absolute',
            width: 244,
            right: 0,
            top: 46,
            borderRadius: tokens.radius.control,
            borderWidth: 1,
            borderColor: tokens.color.separator,
            backgroundColor: tokens.color.paperRaised,
            overflow: 'hidden',
            boxShadow: tokens.shadow.floating,
            zIndex: 200,
          }}
        >
          <View style={{ padding: tokens.space.sm, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}
            >
              {user?.name?.trim() || 'Bòrd account'}
            </Text>
            <Text
              numberOfLines={1}
              style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}
            >
              {user?.email}
            </Text>
          </View>
          {entries.map(([label, icon, path]) => (
            <Pressable
              key={path}
              accessibilityRole="menuitem"
              onPress={() => navigate(path)}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: tokens.space.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.space.sm,
                borderTopWidth: 1,
                borderColor: tokens.color.separator,
                backgroundColor: pressed ? tokens.color.secondarySurface : tokens.color.paperRaised,
              })}
            >
              <Icon name={icon} color={tokens.color.olive} size={17} />
              <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
                {label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => void signOut().then(() => router.replace('/(auth)/sign-in'))}
            style={({ pressed }) => ({
              minHeight: 48,
              paddingHorizontal: tokens.space.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.space.sm,
              borderTopWidth: 1,
              borderColor: tokens.color.separator,
              backgroundColor: pressed ? tokens.color.secondarySurface : tokens.color.paperRaised,
            })}
          >
            <Icon name="rectangle.portrait.and.arrow.right" color={tokens.color.danger} size={17} />
            <Text style={[tokens.type.footnote, { color: tokens.color.danger, fontWeight: '800' }]}>
              Sign out
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
export function IconButton({
  label,
  icon,
  fallback,
  onPress,
  tone = 'neutral',
  appearance = 'filled',
  disabled = false,
  color,
}: {
  label: string;
  icon: string;
  fallback?: string;
  onPress: () => void;
  tone?: 'neutral' | 'accent';
  appearance?: 'filled' | 'plain';
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      onPress={() => {
        if (isIOS) void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        width: tokens.layout.touch,
        height: tokens.layout.touch,
        borderRadius: tokens.layout.touch / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          tone === 'accent'
            ? tokens.color.terracotta
            : appearance === 'plain'
              ? 'transparent'
              : tokens.color.paperRaised,
        borderWidth: tone === 'accent' || appearance === 'plain' ? 0 : 1,
        borderColor: appearance === 'plain' ? 'transparent' : tokens.color.separator,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Icon
        name={icon}
        fallback={fallback}
        size={19}
        color={color ?? (tone === 'accent' ? tokens.color.inverse : tokens.color.ink)}
      />
    </Pressable>
  );
}
export function TopActions({
  children,
  label = 'Page actions',
}: React.PropsWithChildren<{ label?: string }>) {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: tokens.space.xs,
        padding: tokens.space.xs,
        borderRadius: tokens.radius.largeCard,
        backgroundColor: tokens.color.secondarySurface,
        borderWidth: 1,
        borderColor: tokens.color.separator,
      }}
    >
      {children}
    </View>
  );
}
export function Surface({
  children,
  style,
  elevated = false,
}: React.PropsWithChildren<{ style?: ViewStyle; elevated?: boolean }>) {
  return (
    <View
      style={[
        {
          backgroundColor: tokens.color.surface,
          borderWidth: 1,
          borderColor: tokens.color.separator,
          borderRadius: tokens.radius.card,
          padding: tokens.space.md,
          gap: tokens.space.sm,
        },
        elevated ? { boxShadow: tokens.shadow.card } : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const palette =
    tone === 'primary'
      ? { backgroundColor: tokens.color.terracotta, color: tokens.color.inverse }
      : tone === 'danger'
        ? { backgroundColor: '#F7E3DE', color: tokens.color.danger }
        : tone === 'quiet'
          ? { backgroundColor: 'transparent', color: tokens.color.olive }
          : {
              backgroundColor: tokens.color.surface,
              color: tokens.color.ink,
              borderWidth: 1,
              borderColor: tokens.color.separator,
            };
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        if (isIOS) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: tokens.layout.touch,
          paddingHorizontal: tokens.space.md,
          borderRadius: tokens.radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        palette,
      ]}
    >
      {icon ? <Icon name={icon} fallback="+" color={palette.color} size={17} /> : null}
      <Text style={[tokens.type.footnote, { fontWeight: '700', color: palette.color }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Group({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: tokens.space.xs }}>
      <Eyebrow>{title}</Eyebrow>
      <Surface style={{ padding: 0, gap: 0, overflow: 'hidden' }}>{children}</Surface>
    </View>
  );
}
export function Divider() {
  return <View style={{ height: 1, backgroundColor: tokens.color.separator }} />;
}
export function FormField({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
  multiline = false,
  autoCapitalize,
  autoComplete,
  keyboardType,
  textContentType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: React.ComponentProps<typeof TextInput>['autoCapitalize'];
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  textContentType?: React.ComponentProps<typeof TextInput>['textContentType'];
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[tokens.type.caption, { color: tokens.color.ink, fontWeight: '700' }]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        textContentType={textContentType}
        placeholderTextColor={tokens.color.inkTertiary}
        multiline={multiline}
        style={[
          tokens.type.callout,
          {
            borderWidth: 1,
            borderColor: tokens.color.separator,
            backgroundColor: tokens.color.paperRaised,
            color: tokens.color.ink,
            borderRadius: tokens.radius.small,
            paddingHorizontal: tokens.space.sm,
            minHeight: multiline ? 136 : 46,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </View>
  );
}
export function NativeToggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <View
      style={{
        minHeight: 54,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          selectable
          style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '700' }]}
        >
          {label}
        </Text>
        {hint ? (
          <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: tokens.color.olive }}
      />
    </View>
  );
}
export function GlassBar({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const base = {
    borderRadius: tokens.radius.glass,
    overflow: 'hidden' as const,
    padding: tokens.space.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,.72)',
    boxShadow: tokens.shadow.floating,
  };
  if (isIOS)
    return (
      <BlurView tint="systemMaterial" intensity={80} style={[base, style]}>
        {children}
      </BlurView>
    );
  return (
    <View
      style={[
        base,
        { backgroundColor: tokens.color.secondarySurface, borderColor: tokens.color.separator },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: string;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <Surface
      elevated
      style={{ alignItems: 'center', padding: tokens.space.xl, gap: tokens.space.sm }}
    >
      <Icon name={icon} fallback="○" color={tokens.color.olive} size={36} />
      <EditorialText variant="section">{title}</EditorialText>
      <Body muted style={{ textAlign: 'center' }}>
        {detail}
      </Body>
      {action}
    </Surface>
  );
}
export function StatusPill({
  children,
  tone = 'olive',
}: React.PropsWithChildren<{ tone?: 'olive' | 'warning' | 'danger' }>) {
  const color =
    tone === 'warning'
      ? tokens.color.warning
      : tone === 'danger'
        ? tokens.color.danger
        : tokens.color.olive;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: `${color}20`,
        borderRadius: tokens.radius.capsule,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={[tokens.type.caption, { color, fontWeight: '700' }]}>{children}</Text>
    </View>
  );
}
export function FloatingAction({
  label,
  onPress,
  icon = 'plus',
}: {
  label: string;
  onPress: () => void;
  icon?: string;
}) {
  return (
    <GlassBar style={{ alignSelf: 'flex-end' }}>
      <Button label={label} icon={icon} onPress={onPress} />
    </GlassBar>
  );
}
