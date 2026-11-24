// SyncBanner (T039): shows offline / syncing / synced status.
// Rendered at the top of the screen, non-blocking, dismisses automatically.
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { outbox } from '@/data/sync';
import { Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

type SyncState = 'hidden' | 'offline' | 'syncing' | 'synced';

export function SyncBanner() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const [state, setState] = useState<SyncState>('hidden');
  const [opacity] = useState(() => new Animated.Value(0));

  const show = (s: SyncState) => {
    setState(s);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (s === 'synced') {
      setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setState('hidden'));
      }, 2000);
    }
  };

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      if (!s.isConnected) {
        show('offline');
      } else if (state === 'offline') {
        show('syncing');
        // Check pending count after a short delay
        setTimeout(async () => {
          const count = await outbox.getPendingCount();
          show(count === 0 ? 'synced' : 'syncing');
        }, 500);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === 'hidden') return null;

  const bgColor: Record<SyncState, string> = {
    hidden: 'transparent',
    offline: t.colors.warningText,
    syncing: t.colors.primary,
    synced: t.colors.success,
  };
  const msgKey: Record<SyncState, string> = {
    hidden: '',
    offline: 'sync.offline',
    syncing: 'sync.syncing',
    synced: 'sync.synced',
  };

  return (
    <Animated.View
      style={{
        opacity,
        backgroundColor: bgColor[state],
        paddingVertical: 6,
        paddingHorizontal: 16,
        alignItems: 'center',
      }}
      accessibilityLiveRegion="polite"
    >
      <Text variant="footnote" color="onPrimary">{tr(msgKey[state])}</Text>
    </Animated.View>
  );
}
