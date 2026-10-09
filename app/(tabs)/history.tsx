import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { HistoryItem } from '@/components/ui/HistoryItem';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/Skeleton';
import { inter } from '@/theme/fonts';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { SegmentedControl } from '@/components/ui/Toggle';
import { clearOperations, deleteOperation } from '@/core/offline/database';
import { push } from '@/lib/navigation';
import { useHistoryStore } from '@/stores/historyStore';
import { useTheme } from '@/theme/ThemeContext';
import type { HistoryFilter, Operation } from '@/types/history';
import { formatWhen } from '@/utils/formatters';

export default function HistoryScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const operations = useHistoryStore((state) => state.operations);
  const filter = useHistoryStore((state) => state.filter);
  const hasMore = useHistoryStore((state) => state.hasMore);
  const error = useHistoryStore((state) => state.error);
  const isLoading = useHistoryStore((state) => state.isLoading);
  const [confirmClear, setConfirmClear] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void useHistoryStore.getState().load(true);
    }, []),
  );

  function changeFilter(next: HistoryFilter) {
    useHistoryStore.getState().setFilter(next);
    void useHistoryStore.getState().load(true);
  }

  async function remove(id: string) {
    await deleteOperation(id);
    void useHistoryStore.getState().load(true);
  }

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(28) }, inter('extrabold')]}>Histórico</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar histórico" onPress={() => setConfirmClear(true)}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Limpar</Text>
          </Pressable>
        </View>
        <SegmentedControl<HistoryFilter>
          value={filter}
          onChange={changeFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'read', label: 'Lidas' },
            { value: 'write', label: 'Gravadas' },
          ]}
        />
        {error ? <Text style={{ color: colors.error, marginTop: 12 }}>{error}</Text> : null}
        <FlatList
          style={{ marginTop: 14 }}
          data={operations}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (hasMore && !isLoading) {
              void useHistoryStore.getState().load(false);
            }
          }}
          ListEmptyComponent={isLoading ? (
            <View>
              <Skeleton />
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </View>
          ) : <EmptyState title="Nenhuma leitura ou gravação ainda." message="As tags lidas e gravadas aparecem aqui." />}
          renderItem={({ item, index }) => <HistoryRow item={item} index={index} onDelete={() => void remove(item.id)} />}
        />
        <Modal visible={confirmClear} title="Limpar histórico" onClose={() => setConfirmClear(false)}>
          <Text style={[{ color: colors.textSecondary, marginBottom: 12 }, inter('regular')]}>Apagar todo o histórico neste aparelho?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancelar limpeza" onPress={() => setConfirmClear(false)} style={{ flex: 1, alignItems: 'center', padding: 12 }}>
              <Text style={{ color: colors.textSecondary }}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirmar limpeza"
              onPress={() => {
                setConfirmClear(false);
                void clearOperations().then(() => useHistoryStore.getState().load(true));
              }}
              style={{ flex: 1, alignItems: 'center', padding: 12 }}
            >
              <Text style={{ color: colors.error, fontWeight: '700' }}>Apagar</Text>
            </Pressable>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

function HistoryRow({ item, index, onDelete }: { item: Operation; index: number; onDelete: () => void }) {
  const { colors } = useTheme();
  return (
    <Swipeable renderRightActions={() => (
      <Pressable accessibilityRole="button" accessibilityLabel="Excluir registro" onPress={onDelete} style={{ justifyContent: 'center', paddingHorizontal: 16 }}>
        <Text style={{ color: colors.error, fontWeight: '700' }}>Excluir</Text>
      </Pressable>
    )}>
      <HistoryItem index={index} title={item.displayTitle || item.title} subtitle={`${item.tagType ?? 'NTAG213'} · ${formatWhen(item.createdAt)}`} type={item.contentType ?? item.payload?.contentType} onPress={() => push(`/tag-details/${item.id}`)} />
    </Swipeable>
  );
}
