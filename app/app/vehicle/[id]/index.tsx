// Vehicle detail screen (T036): header, timeline grouped by month, filters, FAB.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCents } from '@/domain/money';
import { useVehicle, useRecords } from '@/data/queries';
import type { RecordRow } from '@/data/types';
import { Card, Chip, Divider, EmptyState, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

function formatMonthYear(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByMonth(records: RecordRow[]): { month: string; rows: RecordRow[] }[] {
  const map = new Map<string, RecordRow[]>();
  for (const r of records) {
    const key = r.performed_on.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.entries()].map(([month, rows]) => ({ month, rows }));
}

function RecordItem({ record, vehicleId }: { record: RecordRow; vehicleId: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const catKey = `category.${record.category}`;
  return (
    <Pressable
      onPress={() => router.push(`/record/${record.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${tr(catKey)}, ${formatCents(record.total_cents)}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: t.spacing.sm,
        gap: t.spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{tr(catKey)}</Text>
        {record.shop_name ? (
          <Text variant="footnote" color="textMuted">{record.is_diy ? 'DIY' : record.shop_name}</Text>
        ) : record.is_diy ? (
          <Text variant="footnote" color="textMuted">DIY</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="body" tabular>{formatCents(record.total_cents)}</Text>
        {record.odometer ? (
          <Text variant="footnote" color="textMuted" tabular>
            {record.odometer.toLocaleString()} mi
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type FilterKind = 'all' | 'service' | 'expense';

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicle } = useVehicle(id ?? '');
  const { data: records = [], isLoading } = useRecords(id ?? '');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [fabOpen, setFabOpen] = useState(false);

  const filtered = useMemo(() =>
    filter === 'all' ? records : records.filter((r) => r.kind === filter),
    [records, filter],
  );

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  const displayName = vehicle
    ? (vehicle.nickname ?? `${vehicle.year} ${vehicle.make} ${vehicle.model}`)
    : tr('nav.vehicle');

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* T103b: the vehicle's name is the native header title (and the back label of the screens
          pushed from here); Edit lives in the header. Only the year/make/model line stays in-page. */}
      <Stack.Screen
        options={{
          title: displayName,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/vehicle/${id}/edit`)}
              accessibilityRole="button"
              accessibilityLabel={tr('common.edit')}
              hitSlop={12}
            >
              <Text variant="body" color="accentText">{tr('common.edit')}</Text>
            </Pressable>
          ),
        }}
      />
      {vehicle && vehicle.nickname ? (
        <Text variant="footnote" color="textMuted" style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </Text>
      ) : null}

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
        {(['all', 'service', 'expense'] as const).map((f) => (
          <Chip
            key={f}
            label={f === 'all' ? 'All' : f === 'service' ? 'Service' : 'Expense'}
            tone="neutral"
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: 100 }}>
        {!isLoading && filtered.length === 0 && (
          <EmptyState
            title="No records yet"
            body="Tap the + button to log a service or expense."
          />
        )}
        {groups.map(({ month, rows }) => (
          <View key={month} style={{ gap: t.spacing.sm }}>
            <Text variant="footnote" color="textMuted">{formatMonthYear(month)}</Text>
            <Card padded>
              {rows.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && <Divider />}
                  <RecordItem record={r} vehicleId={id ?? ''} />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>

      {/* FAB */}
      <View
        style={{
          position: 'absolute',
          bottom: t.spacing.xxxl,
          right: t.spacing.lg,
          alignItems: 'flex-end',
          gap: t.spacing.sm,
        }}
        pointerEvents="box-none"
      >
        {fabOpen && (
          <>
            <Pressable
              onPress={() => { setFabOpen(false); router.push(`/odometer/new?vehicleId=${id}`); }}
              accessibilityRole="button"
              accessibilityLabel="Log odometer"
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.pill,
                paddingHorizontal: t.spacing.lg,
                paddingVertical: t.spacing.sm,
                borderWidth: 1,
                borderColor: t.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
              }}
            >
              <Text variant="callout">Odometer</Text>
            </Pressable>
            <Pressable
              onPress={() => { setFabOpen(false); router.push(`/record/new?vehicleId=${id}`); }}
              accessibilityRole="button"
              accessibilityLabel="Log manually"
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.pill,
                paddingHorizontal: t.spacing.lg,
                paddingVertical: t.spacing.sm,
                borderWidth: 1,
                borderColor: t.colors.border,
              }}
            >
              <Text variant="callout">Manual entry</Text>
            </Pressable>
          </>
        )}
        <Pressable
          onPress={() => setFabOpen(!fabOpen)}
          accessibilityRole="button"
          accessibilityLabel={fabOpen ? 'Close menu' : 'Add record'}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: t.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0F1B2D',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Text variant="title2" color="onPrimary" style={{ lineHeight: 28 }}>
            {fabOpen ? '×' : '+'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
