import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link2, QrCode, Unlink } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  getPlaquinhaScanUrl,
  linkPlaquinhaToBrandPage,
  type BrandPage,
} from '@/lib/brandPages';
import { getPlaquinhas, isSessionError, shortDisplayUrl, type RedirectLink } from '@/lib/plaquinhas';
import { goToLogin } from '@/lib/navigation';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

type Props = {
  page: BrandPage;
  onUpdated: (page: BrandPage) => void;
};

/**
 * Após publicar: mostra plaquinha vinculada e permite trocar.
 * Sem plaquinhas: aviso apontando para a aba Plaquinhas — não bloqueia publicação.
 */
export function PlaquinhaVinculoCard({ page, onUpdated }: Props) {
  const { colors, fs } = useTheme();
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await getPlaquinhas());
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const linked = links.find((item) => item.id === page.plaquinha_id) ?? null;
  const scanUrl = page.plaquinha_id ? getPlaquinhaScanUrl(page.plaquinha_id, 'qr') : null;

  async function apply(plaquinhaId: string | null) {
    setBusy(true);
    try {
      const updated = await linkPlaquinhaToBrandPage(page.id, plaquinhaId);
      onUpdated(updated);
      setPicking(false);
      useToastStore.getState().show(plaquinhaId ? 'Plaquinha vinculada.' : 'Vínculo removido.', 'success');
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível vincular.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding={16}>
      <Text accessibilityRole="header" style={[{ color: colors.textMuted, fontSize: fs(12), letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }, inter('bold')]}>
        Plaquinha (NFC / QR)
      </Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(13), lineHeight: fs(19), marginBottom: 12 }, inter('regular')]}>
        O link físico não muda ao editar cores ou links — não precisa regravar a tag nem imprimir outro QR.
      </Text>

      {loading ? (
        <Text style={[{ color: colors.textMuted, fontSize: fs(13) }, inter('regular')]}>Carregando plaquinhas…</Text>
      ) : null}

      {!loading && linked && scanUrl && !picking ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryGlow, alignItems: 'center', justifyContent: 'center' }}>
              <QrCode color={colors.primary} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{linked.name}</Text>
              <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 2 }, inter('medium')]}>
                {linked.id} · {shortDisplayUrl(scanUrl)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Trocar" icon={<Link2 color={colors.textPrimary} size={16} />} onPress={() => setPicking(true)} disabled={busy} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Desvincular" icon={<Unlink color={colors.danger} size={16} />} onPress={() => void apply(null)} disabled={busy} fullWidth />
            </View>
          </View>
        </View>
      ) : null}

      {!loading && !linked && !picking && links.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), lineHeight: fs(20) }, inter('regular')]}>
            Você ainda não tem plaquinhas. Crie uma na aba Plaquinhas — a página pode ficar publicada sem vínculo.
          </Text>
          <PrimaryButton label="Ir para Plaquinhas" onPress={() => router.push('/(tabs)/plaquinhas')} fullWidth />
        </View>
      ) : null}

      {!loading && !picking && !linked && links.length > 0 ? (
        <PrimaryButton label="Vincular plaquinha" icon={<Link2 color={colors.onPrimary} size={16} />} onPress={() => setPicking(true)} disabled={busy} fullWidth />
      ) : null}

      {picking ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 4 }, inter('semibold')]}>Escolha uma plaquinha</Text>
          {links.map((item) => {
            const selected = item.id === page.plaquinha_id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={busy}
                onPress={() => void apply(item.id)}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primaryGlow : pressed ? colors.surfaceElevated : colors.surface,
                })}
              >
                <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{item.name}</Text>
                <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: 2 }, inter('medium')]}>{item.id}</Text>
              </Pressable>
            );
          })}
          <SecondaryButton label="Cancelar" onPress={() => setPicking(false)} disabled={busy} fullWidth />
        </View>
      ) : null}
    </Card>
  );
}
