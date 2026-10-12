import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { AppHeader } from '@/components/layout/AppHeader';
import { WriteProgress } from '@/components/nfc/WriteProgress';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Card } from '@/components/ui/Card';
import { useNfc } from '@/hooks/useNfc';
import { replace } from '@/lib/navigation';
import { markNfcSynced } from '@/lib/plaquinhas';
import { useNfcStore } from '@/stores/nfcStore';
import { useToastStore } from '@/stores/toastStore';
import { useTheme } from '@/theme/ThemeContext';

export default function ProgressScreen() {
  const { colors, fs } = useTheme();
  const { startWrite, cancelOperation, simulateTag, simulationAvailable, writeSteps, isScanning } = useNfc();
  const payload = useNfcStore((state) => state.pendingPayload);
  const lastError = useNfcStore((state) => state.lastError);
  const params = useLocalSearchParams<{ plaquinha?: string | string[] }>();
  const plaquinha = (Array.isArray(params.plaquinha) ? params.plaquinha[0] : params.plaquinha) ?? '';
  const backTo = plaquinha ? `/plaquinha/qr/${encodeURIComponent(plaquinha)}` : null;
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const startRef = useRef(startWrite);
  const cancelRef = useRef(cancelOperation);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => isScanning);
    return () => sub.remove();
  }, [isScanning]);

  useEffect(() => {
    if (!payload) {
      return;
    }
    let alive = true;
    let running = true;
    const cancel = cancelRef.current;
    void (async () => {
      try {
        const result = await startRef.current().finally(() => {
          running = false;
        });
        if (!alive) {
          return;
        }
        if (result.success) {
          // writeFlow só devolve success depois de reler a tag e comparar o conteúdo.
          if (plaquinha) {
            await markNfcSynced(plaquinha)
              .then(() => useToastStore.getState().show('Tag gravada e verificada. Plaquinha com QR + NFC.', 'success'))
              .catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : 'Não foi possível salvar o status.', 'warning'));
          }
          if (alive) {
            setDone(true);
          }
        } else {
          setFailed(true);
        }
      } catch {
        if (alive) {
          setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
      if (running) {
        void cancel();
      }
    };
  }, [payload, plaquinha]);

  if (!payload) {
    return (
      <Screen>
        <AppHeader title="Gravando tag" back />
        <View style={{ padding: 24, gap: 12 }}>
          <Text style={{ color: colors.error }}>Nenhum conteúdo para gravar.</Text>
          <PrimaryButton label="Voltar" onPress={() => replace('/write/configure')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Gravando tag" back={!isScanning} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
        <WriteProgress steps={writeSteps} />
        {done ? (
          <Card variant="success" padding={18} style={{ alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <CircleCheck color={colors.onSuccess} size={28} />
            </View>
            <Text style={{ color: colors.success, fontSize: fs(18), fontWeight: '800' }}>TAG CONFIGURADA</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 6 }}>A gravação foi concluída e o conteúdo foi verificado.</Text>
          </Card>
        ) : null}
        {failed ? (
          <Card variant="error" padding={18}>
            <Text style={{ color: colors.error, fontWeight: '800', fontSize: fs(16) }}>Falha na gravação</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 6 }}>{lastError?.message ?? 'Não foi possível verificar o conteúdo.'}</Text>
            {lastError?.expected || lastError?.found ? (
              <View style={{ marginTop: 10, gap: 6 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>ESPERADO</Text>
                <Text style={{ color: colors.textSecondary }}>{lastError.expected || '—'}</Text>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>ENCONTRADO</Text>
                <Text style={{ color: colors.textSecondary }}>{lastError.found || '—'}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}
        {simulationAvailable && simulateTag && isScanning && !done ? <PrimaryButton label="Simular tag (modo de teste)" variant="secondary" onPress={() => simulateTag('default')} /> : null}
        {done ? <PrimaryButton label="OK" fullWidth onPress={() => replace(backTo ?? '/(tabs)/history')} /> : null}
        {failed ? <PrimaryButton label={backTo ? 'Voltar para a plaquinha' : 'Tentar de novo'} variant="secondary" onPress={() => replace(backTo ?? '/write/configure')} /> : null}
      </ScrollView>
    </Screen>
  );
}
