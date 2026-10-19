import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { ScanLine } from 'lucide-react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { claimPlaquinha } from '@/lib/claimPlaquinha';
import { replace } from '@/lib/navigation';
import { codeFromQrScan, routeAfterQrScan } from '@/lib/qrScanLogic';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Escaneia QR de plaquinha: empty → claim + edição; configurada → abre a tela; externo → não reconhecido. */
export default function ScanQrScreen() {
  const { colors, fs } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(true);
  const lock = useRef(false);

  useFocusEffect(
    useCallback(() => {
      lock.current = false;
      setBusy(false);
      setActive(true);
      return () => {
        setActive(false);
        lock.current = true;
      };
    }, []),
  );

  async function handlePayload(raw: string) {
    if (lock.current || busy) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setActive(false);
    try {
      const code = codeFromQrScan(raw);
      if (!code) {
        useToastStore.getState().show('QR não reconhecido', 'warning');
        lock.current = false;
        setBusy(false);
        setActive(true);
        return;
      }
      const row = await claimPlaquinha(code);
      const decision = routeAfterQrScan(raw, row);
      if (decision.kind === 'unrecognized') {
        useToastStore.getState().show(decision.message, 'warning');
        lock.current = false;
        setBusy(false);
        setActive(true);
        return;
      }
      if (decision.kind === 'not_found') {
        useToastStore.getState().show(decision.message, 'error');
        lock.current = false;
        setBusy(false);
        setActive(true);
        return;
      }
      if (decision.claimed) {
        useToastStore.getState().show('Plaquinha vinculada à sua conta.', 'success');
      }
      replace(decision.path);
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível processar o QR.', 'error');
      lock.current = false;
      setBusy(false);
      setActive(true);
    }
  }

  if (!permission) {
    return (
      <Screen>
        <AppHeader title="Escanear QR" back />
        <View style={{ flex: 1 }} />
      </Screen>
    );
  }

  if (!permission.granted) {
    const blocked = permission.status === 'denied' && !permission.canAskAgain;
    return (
      <Screen>
        <AppHeader title="Escanear QR" back />
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 14 }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
              <ScanLine color={colors.primary} size={40} strokeWidth={1.8} />
            </View>
          </View>
          <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(22), textAlign: 'center' }, inter('extrabold')]}>
            Permissão de câmera
          </Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22) }, inter('regular')]}>
            {blocked
              ? 'A câmera está bloqueada nas configurações do aparelho. Ative o acesso para escanear o QR da plaquinha.'
              : 'Precisamos da câmera para ler o QR Code impresso na plaquinha.'}
          </Text>
          {blocked ? (
            <PrimaryButton
              label="Abrir configurações"
              fullWidth
              onPress={() => {
                if (Platform.OS === 'ios') {
                  void Linking.openURL('app-settings:');
                } else {
                  void Linking.openSettings();
                }
              }}
            />
          ) : (
            <PrimaryButton label="Permitir câmera" fullWidth onPress={() => void requestPermission()} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={null}>
      <AppHeader title="Escanear QR" back />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={active}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            active && !busy
              ? ({ data }) => {
                  void handlePayload(data);
                }
              : undefined
          }
        />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.frame} />
          <Text style={[{ color: '#F8FAFC', fontSize: fs(14), textAlign: 'center', marginTop: 16, paddingHorizontal: 24 }, inter('semibold')]}>
            Aponte para o QR da plaquinha
          </Text>
        </View>
        {busy ? (
          <View style={styles.busy}>
            <Text style={[{ color: '#F8FAFC', fontSize: fs(15) }, inter('bold')]}>Processando…</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(248,250,252,0.85)',
    backgroundColor: 'transparent',
  },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
