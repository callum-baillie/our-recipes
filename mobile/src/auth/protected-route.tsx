import type { PropsWithChildren } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { BordSplashScreen } from '@/components/splash-screen';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { status } = useAuth();

  if (status === 'booting') return <BordSplashScreen />;
  if (status === 'needs-instance') return <Redirect href="/(auth)/instance" />;
  if (status !== 'authenticated') return <Redirect href="/(auth)/sign-in" />;

  return children;
}
