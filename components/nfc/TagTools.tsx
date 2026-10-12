import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { NdefRecord } from 'react-native-nfc-manager';
import { Copy, Eraser, HardDrive, Info, Lock, TriangleAlert } from 'lucide-react-native';

import { ConfirmDialog } from '@/components/nfc/ConfirmDialog';
import { TagOperationModal } from '@/components/nfc/TagOperationModal';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { NormalizedRecord } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { chipOperationUnsupportedReason } from '@/core/nfc/NfcWriter';
import { cloneFlow, eraseFlow, formatFlow, lockFlow, type TagOperation, type TagOperationResult } from '@/core/nfc/tagOperations';
import { platformCapabilities } from '@/core/platform/capabilities';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag } from '@/types/nfc';

export const LOCK_WARNING =
  'ATENÇÃO — AÇÃO IRREVERSÍVEL. Travar a tag impede qualquer gravação futura. Esta ação NÃO pode ser desfeita. A tag ficará em modo somente leitura para sempre. Tem certeza absoluta?';

export const FORMAT_WARNING =
  'Esta tag ainda não está no formato NDEF. Formatar permitirá gravar conteúdo nela. Esta operação pode não ser reversível dependendo do chip.';

export const CLONE_HONESTY = 'O clone copia o conteúdo NDEF (os registros). O UID, senhas e o chip não são copiados: a tag de destino continua com o próprio UID.';

export function lockUnavailableReason(tag: NfcTag | null): string | null {
  const platform = chipOperationUnsupportedReason('lock');
  if (platform) {
    return platform;
  }
  if (!tag) {
    return 'Leia a tag novamente para travar: é preciso conferir que é a mesma tag.';
  }
  if (tag.capabilities.platformLimited) {
    return 'Travar a tag só é possível no Android.';
  }
  if (!tag.capabilities.supportsNdef) {
    return 'Esta tag não está no formato NDEF.';
  }
  if (!tag.capabilities.canWrite) {
    return 'Esta tag já está em modo somente leitura.';
  }
  if (!tag.capabilities.canLock) {
    return 'Este chip não informa suporte a travamento pelo Android.';
  }
  return null;
}

function eraseUnavailableReason(tag: NfcTag | null): string | null {
  if (!tag) {
    return 'Leia a tag novamente para apagar.';
  }
  if (!tag.capabilities.supportsNdef) {
    return 'Esta tag não está no formato NDEF.';
  }
  if (!tag.capabilities.canWrite) {
    return 'A tag está em modo somente leitura e não pode ser apagada.';
  }
  return null;
}

function cloneUnavailableReason(records: unknown[]): string | null {
  if (records.length === 0) {
    return 'A tag está vazia: não há conteúdo NDEF para clonar.';
  }
  if (!platformCapabilities.canWriteNdef && !nfcManager.isSimulation()) {
    return 'Este dispositivo/navegador não grava NFC.';
  }
  return null;
}

export interface TagToolsOptions {
  tag: NfcTag | null;
  records: (NdefRecord | NormalizedRecord)[];
  uidHash: string | null;
  summary: string;
  /** Ferramentas que só fazem sentido com a tag física na tela (lock, apagar, formatar). */
  live: boolean;
  onTagChanged?: (tag: NfcTag) => void;
}

export function useTagTools({ tag, records, uidHash, summary, live, onTagChanged }: TagToolsOptions): {
  actions: ReactNode;
  overlays: ReactNode;
  open: (operation: TagOperation) => void;
} {
  const { colors, fs } = useTheme();
  const [confirm, setConfirm] = useState<TagOperation | null>(null);
  const [running, setRunning] = useState<TagOperation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const showFormat = live && Boolean(tag?.capabilities.canFormat) && !tag?.capabilities.supportsNdef;

  function open(operation: TagOperation) {
    const reason =
      operation === 'clone'
        ? cloneUnavailableReason(records)
        : operation === 'lock'
          ? lockUnavailableReason(tag)
          : operation === 'erase'
            ? eraseUnavailableReason(tag)
            : chipOperationUnsupportedReason('format');
    if (reason) {
      setNotice(reason);
      return;
    }
    if (operation === 'clone') {
      setRunning('clone');
      return;
    }
    setConfirm(operation);
  }

  function runner(operation: TagOperation) {
    return (onStep: (stepId: string) => void): Promise<TagOperationResult> => {
      if (operation === 'clone') {
        return cloneFlow({ sourceRecords: records as NdefRecord[], sourceUidHash: uidHash, summary }, onStep);
      }
      if (operation === 'lock') {
        return lockFlow({ expectedUidHash: uidHash, summary }, onStep);
      }
      if (operation === 'erase') {
        return eraseFlow({ expectedUidHash: uidHash, summary }, onStep);
      }
      return formatFlow(onStep);
    };
  }

  function finish(operation: TagOperation, result: TagOperationResult | null) {
    setRunning(null);
    if (result?.success && result.tag && operation !== 'clone') {
      onTagChanged?.(result.tag);
    }
  }

  const texts: Record<TagOperation, { title: string; instruction: string; success: string }> = {
    clone: { title: 'Clonar tag', instruction: 'Aproxime a tag que receberá o conteúdo', success: 'Tag clonada com sucesso' },
    lock: { title: 'Travar tag', instruction: 'Aproxime a MESMA tag mostrada na tela', success: 'Tag travada. Agora ela é somente leitura.' },
    erase: { title: 'Apagar conteúdo', instruction: 'Aproxime a mesma tag para apagar', success: 'Conteúdo apagado e verificado. A tag está vazia.' },
    format: { title: 'Formatar como NDEF', instruction: 'Aproxime a tag para formatar', success: 'Tag formatada como NDEF e pronta para gravar.' },
  };

  const actions = (
    <View style={{ gap: 10 }}>
      <PrimaryButton label="Clonar esta tag" variant="secondary" fullWidth icon={<Copy color={colors.primary} size={18} />} onPress={() => open('clone')} />
      {live ? (
        <>
          <PrimaryButton label="Apagar conteúdo" variant="secondary" fullWidth icon={<Eraser color={colors.primary} size={18} />} onPress={() => open('erase')} />
          <PrimaryButton label="Travar tag" variant="secondary" fullWidth icon={<Lock color={colors.error} size={18} />} onPress={() => open('lock')} />
        </>
      ) : null}
      {showFormat ? <PrimaryButton label="Formatar como NDEF" variant="secondary" fullWidth icon={<HardDrive color={colors.primary} size={18} />} onPress={() => open('format')} /> : null}
      <Text style={[{ color: colors.textMuted, fontSize: fs(12) }, inter('regular')]}>{CLONE_HONESTY}</Text>
    </View>
  );

  const overlays = (
    <>
      <ConfirmDialog
        visible={confirm === 'lock'}
        title="Travar tag permanentemente"
        danger
        icon={<TriangleAlert color={colors.error} size={22} />}
        message={LOCK_WARNING}
        confirmLabel="Travar permanentemente"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          setRunning('lock');
        }}
      />
      <ConfirmDialog
        visible={confirm === 'erase'}
        title="Apagar conteúdo da tag"
        message="O conteúdo atual será removido. A tag ficará vazia e pronta para novo conteúdo."
        details={<Text style={[{ color: colors.textPrimary, fontSize: fs(13), marginBottom: 8 }, inter('semibold')]}>Conteúdo atual: {summary}</Text>}
        danger={false}
        confirmLabel="Apagar"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          setRunning('erase');
        }}
      />
      <ConfirmDialog
        visible={confirm === 'format'}
        title="Formatar tag"
        icon={<TriangleAlert color={colors.warning} size={22} />}
        message={FORMAT_WARNING}
        confirmLabel="Formatar"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          setRunning('format');
        }}
      />
      <ConfirmDialog
        visible={notice !== null}
        title="Não disponível"
        icon={<Info color={colors.primary} size={22} />}
        message={notice ?? ''}
        confirmLabel="Entendi"
        cancelable={false}
        onCancel={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />
      {running ? (
        <TagOperationModal
          visible
          operation={running}
          title={texts[running].title}
          instruction={texts[running].instruction}
          successText={texts[running].success}
          simulateKind={running === 'clone' ? 'empty' : running === 'erase' ? 'default' : undefined}
          run={runner(running)}
          onClose={(result) => finish(running, result)}
        />
      ) : null}
    </>
  );

  return { actions, overlays, open };
}
