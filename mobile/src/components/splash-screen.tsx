import { ActivityIndicator, View } from 'react-native';
import { BordLogo } from '@/components/bord-logo';
import { tokens } from '@/theme/tokens';

export function BordSplashScreen() {
  return (
    <View
      accessibilityLabel="Opening Bòrd"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: tokens.space.xl,
        backgroundColor: tokens.color.paper,
      }}
    >
      <BordLogo style={{ width: 210, height: 66 }} />
      <ActivityIndicator accessibilityLabel="Loading" color={tokens.color.olive} />
    </View>
  );
}
