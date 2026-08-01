import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

const headerLockup = require('../../assets/brand/bord-header-lockup.svg');

export function BordLogo({ compact = false, style }: { compact?: boolean; style?: ViewStyle }) {
  const width = compact ? 76 : 132;
  const height = compact ? 24 : 38;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Bòrd"
      style={[{ width, height }, style]}
    >
      <Image
        source={headerLockup}
        contentFit="contain"
        tintColor={tokens.color.ink}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
