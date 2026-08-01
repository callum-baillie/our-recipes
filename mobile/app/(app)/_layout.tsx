import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { tokens } from '@/theme/tokens';
import { useAuth } from '@/auth/auth-context';
export default function AppTabs() {
  const { status } = useAuth();
  if (status === 'booting') return null;
  if (status === 'needs-instance') return <Redirect href="/(auth)/instance" />;
  if (status !== 'authenticated') return <Redirect href="/(auth)/sign-in" />;
  if (Platform.OS === 'web') {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.color.olive,
          tabBarInactiveTintColor: tokens.color.inkSecondary,
          tabBarStyle: {
            minHeight: 62,
            backgroundColor: tokens.color.paperRaised,
            borderTopColor: tokens.color.separator,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="(recipes)"
          options={{
            title: 'Recipes',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="book-open-page-variant" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="(plan)"
          options={{
            title: 'Plan',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="calendar-month" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="(pantry)"
          options={{
            title: 'Pantry',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="archive-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="(nutrition)"
          options={{
            title: 'Nutrition',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="chart-donut" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="(lists)"
          options={{
            title: 'Lists',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="clipboard-list-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    );
  }
  return (
    <NativeTabs tintColor={tokens.color.olive}>
      <NativeTabs.Trigger name="(recipes)">
        <Icon
          sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="book-open-page-variant" />}
        />
        <Label>Recipes</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(plan)">
        <Icon
          sf={{ default: 'calendar', selected: 'calendar' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="calendar-month" />}
        />
        <Label>Plan</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(pantry)">
        <Icon
          sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="archive-outline" />}
        />
        <Label>Pantry</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(nutrition)">
        <Icon
          sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="chart-donut" />}
        />
        <Label>Nutrition</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(lists)">
        <Icon
          sf={{ default: 'list.bullet.clipboard', selected: 'list.bullet.clipboard.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="clipboard-list-outline" />}
        />
        <Label>Lists</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
