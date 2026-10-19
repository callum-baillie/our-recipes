import * as React from 'react';
import { useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
export function useScreenAwake(enabled: boolean) {
  const tag = React.useId();
  useFocusEffect(
    React.useCallback(() => {
      if (!enabled) return;
      let active = true;
      void activateKeepAwakeAsync(tag)
        .then(() => {
          if (!active) void deactivateKeepAwake(tag).catch(() => {});
        })
        .catch(() => {});
      return () => {
        active = false;
        void deactivateKeepAwake(tag).catch(() => {});
      };
    }, [enabled, tag]),
  );
}
