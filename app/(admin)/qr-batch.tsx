import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CircleDashed, FileDown, FileSpreadsheet, QrCode, RotateCcw } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppHeader } from '@/components/layout/AppHeader';
import { CONTENT_WIDTH } from '@/components/layout/ContentContainer';
import { Screen } from '@/components/layout/Screen';
import { DestinationIcon } from '@/components/plaquinha/DestinoForm';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Toggle } from '@/components/ui/Toggle';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { createBatch, type BatchItem } from '@/lib/adminApi';
import { downloadCsv } from '@/lib/downloadCsv';
import { exportHtmlAsPdf } from '@/lib/exportPdf';
import { getLinkUrl } from '@/lib/plaquinhas';
import {
  BATCH_MAX,
  BATCH_PREFIX_MAX,
  BATCH_TYPE_LABELS,
  BATCH_TYPES,
  batchChunks,
  batchDestinationLabel,
  batchPdfHtml,
  batchToCsv,
  sortByBatchNumber,
  validateBatchForm,
  type BatchForm,
  type BatchType,
} from '@/lib/qrBatch';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const URL_HINT: Record<BatchType, { label: string; placeholder: string } | null> = {
  url: { label: 'URL padrão (opcional)', placeholder: 'https://seusite.com.br' },
  whatsapp: { label: 'WhatsApp padrão (opcional)', placeholder: '11 99999-8888 ou https://wa.me/...' },
  instagram: { label: 'Instagram padrão (opcional)', placeholder: '@seuperfil' },
  profile: null,
  empty: null,
};

function TypeIcon({ type }: { type: BatchType }) {
  const { colors } = useTheme();
  if (type === 'empty') {
    return (
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
        <CircleDashed color={colors.textSecondary} size={14} />
      </View>
    );
  }
  return <DestinationIcon type={type} size={28} />;
}

export default function QrBatchScreen() {
  const { colors, fs } = useTheme();
  const { isPhone, isBigTablet } = useBreakpoint();
  const [form, setForm] = useState<BatchForm>({ quantity: '10', prefix: 'Mesa', type: 'url', url: '' });
  const [makePdf, setMakePdf] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [items, setItems] = useState<BatchItem[] | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const set = (patch: Partial<BatchForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError('');
  };

  const creating = progress !== null && items === null;
  const columns = isBigTablet ? 4 : isPhone ? 2 : 3;
  const hint = URL_HINT[form.type];

  async function exportPdf(list: BatchItem[]) {
    setExporting('pdf');
    try {
      await exportHtmlAsPdf(batchPdfHtml(list, (id) => getLinkUrl(id), `${form.prefix.trim()} — QR Codes`), 'Exportar PDF');
    } catch (caught) {
      useToastStore.getState().show(caught instanceof Error ? caught.message : 'Não foi possível gerar o PDF.', 'error');
    } finally {
      setExporting(null);
    }
  }

  async function exportCsv(list: BatchItem[]) {
    setExporting('csv');
    try {
      const slug = form.prefix.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plaquinhas';
      await downloadCsv(`${slug}-qr.csv`, batchToCsv(list, (id) => getLinkUrl(id)));
    } catch (caught) {
      useToastStore.getState().show(caught instanceof Error ? caught.message : 'Não foi possível exportar o CSV.', 'error');
    } finally {
      setExporting(null);
    }
  }

  async function generate() {
    const checked = validateBatchForm(form);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    const request = checked.value;
    const created: BatchItem[] = [];
    setError('');
    setItems(null);
    setProgress({ done: 0, total: request.quantity });
    try {
      for (const chunk of batchChunks(request.quantity)) {
        created.push(...(await createBatch({ ...request, start: chunk.start, quantity: chunk.quantity })));
        setProgress({ done: created.length, total: request.quantity });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Falha ao criar o lote.';
      setError(created.length ? `${message} Criadas ${created.length} de ${request.quantity}.` : message);
      if (!created.length) {
        setProgress(null);
        return;
      }
    }
    const sorted = sortByBatchNumber(created);
    setItems(sorted);
    useToastStore.getState().show(`${sorted.length} ${sorted.length === 1 ? 'plaquinha criada' : 'plaquinhas criadas'}.`, 'success');
    if (makePdf && sorted.length) {
      await exportPdf(sorted);
    }
  }

  function reset() {
    setItems(null);
    setProgress(null);
    setError('');
  }

  return (
    <Screen maxWidth={CONTENT_WIDTH.home}>
      <AppHeader title="Gerar QR Codes em lote" back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        {items === null ? (
          <Card padding={16}>
            <View testID="qr-batch-form" style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Input
                  label="Quantidade"
                  value={form.quantity}
                  onChangeText={(quantity) => set({ quantity: quantity.replace(/\D/g, '').slice(0, 3) })}
                  keyboardType="number-pad"
                  placeholder={`1 a ${BATCH_MAX}`}
                  editable={!creating}
                  containerStyle={{ width: 120 }}
                />
                <Input
                  label="Prefixo do nome"
                  value={form.prefix}
                  onChangeText={(prefix) => set({ prefix })}
                  maxLength={BATCH_PREFIX_MAX}
                  placeholder="Mesa"
                  editable={!creating}
                  containerStyle={{ flex: 1 }}
                />
              </View>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12), marginTop: -6, marginBottom: 14 }, inter('regular')]}>
                Nomes: {form.prefix.trim() || 'Prefixo'} 1, {form.prefix.trim() || 'Prefixo'} 2 ... {form.prefix.trim() || 'Prefixo'} {Number(form.quantity) || 'N'}
              </Text>
              <Text style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 8 }, inter('bold')]}>Tipo de destino padrão</Text>
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {BATCH_TYPES.map((type) => {
                  const selected = form.type === type;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="radio"
                      accessibilityLabel={BATCH_TYPE_LABELS[type]}
                      accessibilityState={{ selected }}
                      disabled={creating}
                      onPress={() => set({ type })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                        paddingLeft: 6,
                        paddingRight: 12,
                        borderRadius: radius.pill,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primaryGlow : colors.surface,
                      }}
                    >
                      <TypeIcon type={type} />
                      <Text style={[{ color: selected ? colors.primary : colors.textPrimary, fontSize: fs(14) }, inter(selected ? 'bold' : 'medium')]}>{BATCH_TYPE_LABELS[type]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {hint ? (
                <Input
                  label={hint.label}
                  value={form.url}
                  onChangeText={(url) => set({ url })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={form.type === 'whatsapp' ? 'default' : 'url'}
                  placeholder={hint.placeholder}
                  editable={!creating}
                />
              ) : null}
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12), marginTop: hint ? -6 : 0, marginBottom: 14 }, inter('regular')]}>
                {form.type === 'profile'
                  ? 'Cada plaquinha nasce com a página de perfil ativa.'
                  : form.type === 'empty' || !form.url.trim()
                    ? 'Sem destino: as plaquinhas nascem desativadas até alguém configurar o destino.'
                    : 'Todas apontam para este destino; dá para editar cada uma depois.'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Gerar PDF</Text>
                  <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('regular')]}>Abre o PDF para imprimir assim que terminar.</Text>
                </View>
                <Toggle value={makePdf} onValueChange={setMakePdf} accessibilityLabel="Gerar PDF" />
              </View>
              {error ? <Text accessibilityRole="alert" style={[{ color: colors.error, marginBottom: 12 }, inter('medium')]}>{error}</Text> : null}
              {progress && creating ? (
                <View testID="qr-batch-progress" accessibilityLiveRegion="polite" style={{ marginBottom: 12 }}>
                  <Text style={[{ color: colors.textPrimary, fontSize: fs(15), marginBottom: 6 }, inter('bold')]}>
                    Criando {progress.done}/{progress.total}...
                  </Text>
                  <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.backgroundSecondary }}>
                    <View style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, height: 10, borderRadius: 6, backgroundColor: colors.primary }} />
                  </View>
                </View>
              ) : null}
              <PrimaryButton label="Gerar plaquinhas" fullWidth loading={creating} icon={<QrCode color={colors.onPrimary} size={18} />} onPress={() => void generate()} />
            </View>
          </Card>
        ) : (
          <>
            <Card padding={16}>
              <View testID="qr-batch-result" style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(18) }, inter('extrabold')]}>
                  {items.length} {items.length === 1 ? 'plaquinha criada' : 'plaquinhas criadas'}
                </Text>
                {error ? <Text accessibilityRole="alert" style={[{ color: colors.error }, inter('medium')]}>{error}</Text> : null}
                <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: 8 }}>
                  <View style={{ flex: isPhone ? undefined : 1 }}>
                    <PrimaryButton label="Exportar PDF" fullWidth loading={exporting === 'pdf'} disabled={exporting !== null} icon={<FileDown color={colors.onPrimary} size={18} />} onPress={() => void exportPdf(items)} />
                  </View>
                  <View style={{ flex: isPhone ? undefined : 1 }}>
                    <PrimaryButton label="Exportar CSV" variant="secondary" fullWidth loading={exporting === 'csv'} disabled={exporting !== null} icon={<FileSpreadsheet color={colors.primary} size={18} />} onPress={() => void exportCsv(items)} />
                  </View>
                  <View style={{ flex: isPhone ? undefined : 1 }}>
                    <PrimaryButton label="Gerar outro lote" variant="ghost" fullWidth icon={<RotateCcw color={colors.primary} size={18} />} onPress={reset} />
                  </View>
                </View>
              </View>
            </Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
              {items.map((item) => (
                <View key={item.id} style={{ width: `${100 / columns}%`, padding: 6 }}>
                  <Card padding={12}>
                    <View testID="qr-batch-item" style={{ alignItems: 'center', gap: 6 }}>
                      <View style={{ padding: 8, backgroundColor: '#FFFFFF', borderRadius: radius.sm }}>
                        <QRCode value={getLinkUrl(item.id)} size={isPhone ? 120 : 140} color="#0F172A" backgroundColor="white" ecl="M" />
                      </View>
                      <Text selectable style={[{ color: colors.textPrimary, fontSize: fs(16), letterSpacing: 1 }, inter('extrabold')]}>{item.id}</Text>
                      <Text numberOfLines={1} style={[{ color: colors.textSecondary, fontSize: fs(13) }, inter('semibold')]}>{item.name}</Text>
                      <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: item.destination_type === 'empty' ? colors.textMuted : colors.primary, fontSize: fs(12) }, inter('medium')]}>
                        {batchDestinationLabel(item)}
                      </Text>
                    </View>
                  </Card>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
