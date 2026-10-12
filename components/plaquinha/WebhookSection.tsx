import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Toggle } from '@/components/ui/Toggle';
import { updateWebhook, type RedirectLink } from '@/lib/plaquinhas';
import { useToastStore } from '@/stores/toastStore';
import { checkWebhookUrl } from '@/supabase/functions/_shared/webhook';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

export function WebhookSection({ link, onSaved }: { link: RedirectLink; onSaved: (webhookUrl: string | null) => void }) {
  const { colors, fs } = useTheme();
  const saved = link.webhook_url ?? null;
  const [enabled, setEnabled] = useState(saved !== null);
  const [url, setUrl] = useState(saved ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unsupported = link.webhook_url === undefined;

  async function persist(next: string | null) {
    setBusy(true);
    try {
      const value = await updateWebhook(link.id, next);
      onSaved(value);
      if (value) {
        setUrl(value);
      }
      useToastStore.getState().show(value ? 'Webhook salvo. Cada scan envia um POST para essa URL.' : 'Webhook desligado.', 'success');
    } catch (failure) {
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível salvar o webhook.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function onToggle(next: boolean) {
    setEnabled(next);
    setError(null);
    if (!next && saved !== null) {
      void persist(null);
    }
  }

  function save() {
    const check = checkWebhookUrl(url);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    void persist(check.url);
  }

  return (
    <Card padding={16} style={{ marginTop: 14 }}>
      <View testID="webhook-section">
        <Text accessibilityRole="header" style={[{ color: colors.textMuted, fontSize: fs(12), letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }, inter('bold')]}>
          Webhook
        </Text>
        {unsupported ? (
          <Text style={[{ color: colors.textSecondary, fontSize: fs(13), lineHeight: fs(19) }, inter('regular')]}>
            O servidor ainda não tem suporte a webhook. Aplique a atualização do banco (supabase db push).
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>Webhook ativo</Text>
              <Toggle value={enabled} onValueChange={onToggle} accessibilityLabel="Webhook ativo" />
            </View>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(13), lineHeight: fs(19), marginTop: 6 }, inter('regular')]}>
              Quando alguém escanear esta plaquinha, enviaremos uma requisição POST para esta URL com os dados do scan.
            </Text>
            {enabled ? (
              <View style={{ marginTop: 12 }}>
                <Input
                  label="URL do webhook"
                  value={url}
                  onChangeText={(value) => {
                    setUrl(value);
                    setError(null);
                  }}
                  placeholder="https://seu-servidor.com/webhook"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  error={error ?? undefined}
                />
                <Text style={[{ color: colors.textMuted, fontSize: fs(12), marginTop: -6, marginBottom: 12 }, inter('regular')]}>
                  {'Só https. Envia JSON: link_id, scan_type, scanned_at e scan_count.'}
                </Text>
                <PrimaryButton label="Salvar webhook" variant="secondary" fullWidth loading={busy} disabled={url.trim() === (saved ?? '')} onPress={save} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}
