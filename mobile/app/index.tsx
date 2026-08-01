import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { BordSplashScreen } from '@/components/splash-screen';

export default function Index() {
  const { status } = useAuth();
  if (status === 'booting') return <BordSplashScreen />;
  if (status === 'needs-instance') return <Redirect href="/(auth)/instance" />;
  if (status === 'needs-auth') return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(app)/(recipes)" />;
}
