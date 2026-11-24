// SyncBanner (T039, T098): offline / syncing / synced status, plus changes that couldn't sync.
// Rendered at the top of the signed-in stack, non-blocking. The "couldn't sync" state stays
// until the user reviews it: tap to expand, then Retry or Discard each change.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OutboxEntry, RpcPayload } from '@/data/outbox';
import { outbox, retryDead } from '@/data/sync';
import { Button, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

type SyncState = 'hidden' | 'offline' | 'syncing' | 'synced' | 'dead';

function describe(entry: OutboxEntry, tr: TFunction): string {
  if (entry.operation === 'rpc') {
    const record = (entry.payload as unknown as RpcPayload).args.p_record as { title?: string } | undefined;
    if (record?.title) return tr('sync.changeRecord', { title: record.title });
  }
  return tr('sync.changeTable', { table: entry.table.replace(/_/g, ' ') });
}

export function SyncBanner() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [dead, setDead] = useState<OutboxEntry[]>([]);
  const [showSynced, setShowSynced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));
  const prevPending = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([outbox.getPendingCount(), outbox.getDead()]);
      if (prevPending.current > 0 && p === 0) {
        setShowSynced(true);
        setTimeout(() => setShowSynced(false), 2000);
      }
      prevPending.current = p;
      setPending(p);
      setDead(d);
      if (d.length === 0) setExpanded(false);
    } catch {
      // outbox not ready yet; the next change event refreshes
    }
  }, []);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => setOffline(s.isConnected === false));
    const unsubOutbox = outbox.subscribe(() => {
      void refresh();
    });
    // Initial read from the external outbox store (async; state is set after it resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      unsubNet();
      unsubOutbox();
    };
  }, [refresh]);

  const state: SyncState = offline
    ? 'offline'
    : dead.length > 0
      ? 'dead'
      : pending > 0
        ? 'syncing'
        : showSynced
          ? 'synced'
          : 'hidden';

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: state === 'hidden' ? 0 : 1,
      duration: state === 'hidden' ? 300 : 200,
      useNativeDriver: true,
    }).start();
  }, [state, opacity]);

  if (state === 'hidden') return null;

  return <View style={{ paddingTop: insets.top, backgroundColor: t.colors.bg }}>{renderBody()}</View>;

  function renderBody() {
    if (state === 'dead') {
      return (
        <Animated.View
          style={{
            opacity,
            backgroundColor: t.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.danger,
          }}
          accessibilityLiveRegion="polite"
        >
          <Pressable
            onPress={() => setExpanded((e) => !e)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={{ paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' }}
          >
            <Text variant="footnote" color="dangerText">
              {tr('sync.dead', { count: dead.length })}
            </Text>
          </Pressable>
          {expanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
              <Text variant="footnote" color="textMuted">
                {tr('sync.reviewHint')}
              </Text>
              {dead.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="subhead" style={{ flex: 1 }} numberOfLines={1}>
                    {describe(e, tr)}
                  </Text>
                  <Button title={tr('sync.retry')} variant="secondary" onPress={() => void retryDead(e.id)} />
                  <Button title={tr('sync.discard')} variant="ghost" onPress={() => void outbox.discard(e.id)} />
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      );
    }

    const s = state as Exclude<SyncState, 'hidden' | 'dead'>;
    const bgColor: Record<Exclude<SyncState, 'hidden' | 'dead'>, string> = {
      offline: t.colors.warningText,
      syncing: t.colors.primary,
      synced: t.colors.success,
    };
    const msgKey: Record<Exclude<SyncState, 'hidden' | 'dead'>, string> = {
      offline: 'sync.offline',
      syncing: 'sync.syncing',
      synced: 'sync.synced',
    };

    return (
      <Animated.View
        style={{
          opacity,
          backgroundColor: bgColor[s],
          paddingVertical: 6,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}
        accessibilityLiveRegion="polite"
      >
        <Text variant="footnote" color="onPrimary">
          {tr(msgKey[s])}
        </Text>
      </Animated.View>
    );
  }
}
