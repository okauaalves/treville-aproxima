import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { KeyRound, Lock, Search } from 'lucide-react-native';

import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { lookupPlaquinha, requestEditAccess, type PlaquinhaLookup } from '@/lib/adminAccess';
import { EDIT_REASON_MAX, parsePlaquinhaCode, type EditBadge } from '@/lib/editAccessLogic';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

type Props = {
  visible: boolean;
  /** Código vindo da tag NFC/QR ou de "Solicitar novamente": já abre procurando. Remonte (key) a cada abertura. */
  initialCode?: string | null;
  onClose: () => void;
  onSent: () => void;
  isOwn: (id: string) => boolean;
  activeAccess: (id: string) => EditBadge | undefined;
};

type Precheck = { code: string } | { error: string };

/** Descoberta por código + pedido. A RPC devolve só id e nome; dono/destino ficam no servidor. */
export function SolicitarAcessoModal({ visible, initialCode, onClose, onSent, isOwn, activeAccess }: Props) {
  const { colors, fs } = useTheme();

  function precheck(raw: string): Precheck {
    const parsed = parsePlaquinhaCode(raw);
    if (!parsed) {
      return { error: 'Código inválido. Use 4 a 8 letras/números ou cole a URL da plaquinha.' };
    }
    if (isOwn(parsed)) {
      return { error: 'Esta plaquinha já é sua. Edite pela lista de plaquinhas.' };
    }
    const current = activeAccess(parsed);
    if (current?.kind === 'authorized') {
      return { error: 'Você já tem acesso de edição a esta plaquinha.' };
    }
    if (current?.kind === 'waiting') {
      return { error: 'Sua solicitação para esta plaquinha já está aguardando aprovação.' };
    }
    return { code: parsed };
  }

  const [initial] = useState<Precheck | null>(() => (initialCode ? precheck(initialCode) : null));
  const [code, setCode] = useState(initialCode ?? '');
  const [found, setFound] = useState<PlaquinhaLookup | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(() => (initial && 'error' in initial ? initial.error : ''));
  const [busy, setBusy] = useState(() => Boolean(initial && 'code' in initial));

  function applyLookup(result: PlaquinhaLookup | null) {
    if (result) {
      setFound(result);
    } else {
      setError('Nenhuma plaquinha encontrada com este código.');
    }
  }

  useEffect(() => {
    if (!initial || !('code' in initial)) {
      return;
    }
    let alive = true;
    lookupPlaquinha(initial.code)
      .then((result) => {
        if (!alive) {
          return;
        }
        if (result) {
          setFound(result);
        } else {
          setError('Nenhuma plaquinha encontrada com este código.');
        }
      })
      .catch((caught: unknown) => alive && setError(caught instanceof Error ? caught.message : 'Não foi possível procurar a plaquinha.'))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [initial]);

  async function search(raw: string) {
    const checked = precheck(raw);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      applyLookup(await lookupPlaquinha(checked.code));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível procurar a plaquinha.');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!found) {
      return;
    }
    if (reason.trim().length > EDIT_REASON_MAX) {
      setError(`Motivo muito longo (máximo ${EDIT_REASON_MAX} caracteres).`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestEditAccess(found.id, found.name, reason);
      useToastStore.getState().show('Solicitação enviada! Aguarde aprovação.', 'success');
      onSent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setBusy(false);
    }
  }

  const close = () => (busy ? undefined : onClose());

  if (!found) {
    return (
      <Modal visible={visible} title="Solicitar acesso a uma plaquinha" onClose={close}>
        <View testID="solicitar-acesso-busca">
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), marginBottom: 12, lineHeight: fs(20) }, inter('regular')]}>
            Digite o código impresso na plaquinha (ex.: K7M2QX) ou cole a URL do QR Code. Também dá para ler a tag NFC na tela inicial.
          </Text>
          <Input
            label="Código ou URL da plaquinha"
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setError('');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="K7M2QX"
            error={error}
            leftIcon={<KeyRound color={colors.textSecondary} size={18} style={{ marginRight: 8 }} />}
            onSubmitEditing={() => void search(code)}
          />
          <PrimaryButton label="Procurar" fullWidth loading={busy} icon={<Search color={colors.onPrimary} size={18} />} onPress={() => void search(code)} />
          <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={close} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} title="Solicitar acesso de edição" onClose={close}>
      <View testID="solicitar-acesso-confirmar">
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' }}>
            <Lock color={colors.warning} size={30} strokeWidth={2.2} />
          </View>
          <Text numberOfLines={1} style={[{ color: colors.textPrimary, fontSize: fs(17) }, inter('bold')]}>
            {found.name}
          </Text>
          <Text style={[{ color: colors.textMuted, fontSize: fs(12), letterSpacing: 1 }, inter('semibold')]}>{found.id}</Text>
          <Text style={[{ color: colors.textPrimary, fontSize: fs(15), textAlign: 'center' }, inter('semibold')]}>Esta plaquinha pertence a outro usuário</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: fs(14), textAlign: 'center' }, inter('regular')]}>Solicite acesso de edição ao administrador</Text>
        </View>
        <Input
          label="Motivo (opcional)"
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            setError('');
          }}
          multiline
          maxLength={EDIT_REASON_MAX}
          placeholder="Ex.: recebi esta plaquinha para o meu restaurante"
          error={error}
        />
        <Text style={[{ color: colors.textMuted, fontSize: fs(11), textAlign: 'right', marginTop: -10, marginBottom: 10 }, inter('medium')]}>
          {reason.length}/{EDIT_REASON_MAX}
        </Text>
        <PrimaryButton label="Solicitar acesso" fullWidth loading={busy} onPress={() => void send()} />
        <PrimaryButton label="Cancelar" variant="ghost" fullWidth style={{ marginTop: 8 }} onPress={close} />
      </View>
    </Modal>
  );
}
