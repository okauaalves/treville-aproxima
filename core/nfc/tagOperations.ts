import { Platform } from 'react-native';
import type { NdefRecord } from 'react-native-nfc-manager';

import { NfcError, toNfcError } from '@/core/nfc/errors';
import { NfcTech } from '@/core/nfc/nfcNative';
import { nfcManager } from '@/core/nfc/NfcManager';
import { chipOperationUnsupportedReason, nfcWriter, type VerifiedWriteResult } from '@/core/nfc/NfcWriter';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { buildTechnicalSnapshot } from '@/core/nfc/technical';
import { hashUid, initDatabase, saveOperation } from '@/core/offline/database';
import { statusFromIntegrity } from '@/core/offline/mappers';
import type { OperationKind } from '@/types/history';
import type { NfcTag } from '@/types/nfc';

export type TagOperation = 'clone' | 'lock' | 'format' | 'erase';

export interface OperationStepDef {
  id: string;
  label: string;
}

export const OPERATION_STEPS: Record<TagOperation, OperationStepDef[]> = {
  clone: [
    { id: 'wait', label: 'Aguardando tag' },
    { id: 'write', label: 'Gravando' },
    { id: 'verify', label: 'Verificando' },
    { id: 'done', label: 'Clonado' },
  ],
  lock: [
    { id: 'wait', label: 'Aguardando tag' },
    { id: 'check', label: 'Conferindo se é a mesma tag' },
    { id: 'write', label: 'Travando' },
    { id: 'verify', label: 'Verificando' },
    { id: 'done', label: 'Travada' },
  ],
  format: [
    { id: 'wait', label: 'Aguardando tag' },
    { id: 'write', label: 'Formatando' },
    { id: 'verify', label: 'Reavaliando capacidades' },
    { id: 'done', label: 'Formatada' },
  ],
  erase: [
    { id: 'wait', label: 'Aguardando tag' },
    { id: 'check', label: 'Conferindo se é a mesma tag' },
    { id: 'write', label: 'Apagando' },
    { id: 'verify', label: 'Verificando' },
    { id: 'done', label: 'Apagada' },
  ],
};

export interface TagOperationResult {
  success: boolean;
  tag?: NfcTag;
  integrityPercent?: number;
  durationMs: number;
  error?: NfcError;
}

type StepHandler = (stepId: string) => void;

const KIND: Record<TagOperation, OperationKind> = { clone: 'CLONE', lock: 'LOCK', format: 'FORMAT', erase: 'ERASE' };
const TITLES: Record<TagOperation, string> = { clone: 'Clonar tag', lock: 'Travar tag', format: 'Formatar como NDEF', erase: 'Apagar tag' };

async function detect(techs: string[], alertMessage: string): Promise<NfcTag> {
  await nfcManager.requestTechnologyWithTimeout(techs, undefined, { alertMessage });
  const raw = await nfcManager.getTag();
  if (!raw) {
    throw new NfcError('READ_FAILED', 'Tag não encontrada');
  }
  return tagAnalyzer.analyze(raw);
}

async function ensureSameTag(tag: NfcTag, expectedUidHash?: string | null): Promise<void> {
  if (!expectedUidHash) {
    return;
  }
  const hash = tag.uid ? await hashUid(tag.uid) : '';
  if (hash !== expectedUidHash) {
    throw new NfcError('TAG_MISMATCH');
  }
}

async function record(
  operation: TagOperation,
  started: number,
  tag: NfcTag | undefined,
  result: Partial<VerifiedWriteResult> & { success: boolean },
  displayValue: string,
): Promise<void> {
  if (result.error?.code === 'USER_CANCELLED') {
    return;
  }
  const integrity = result.verification?.integrityPercent;
  await initDatabase();
  await saveOperation({
    tagUid: tag?.uid,
    tagType: tag?.type ?? null,
    tagCapacity: tag?.capacity ?? null,
    operation: KIND[operation],
    status: integrity !== undefined ? statusFromIntegrity(result.success, integrity) : result.success ? 'SUCCESS' : 'FAILED',
    displayTitle: TITLES[operation],
    displayValue,
    integrityPercent: integrity ?? null,
    errorMessage: result.error?.message ?? null,
    durationMs: Date.now() - started,
    technical: result.tag ?? tag ? buildTechnicalSnapshot((result.tag ?? tag) as NfcTag, Platform.OS, nfcManager.isSimulation()) : null,
  }).catch(() => undefined);
}

async function run(
  operation: TagOperation,
  displayValue: string,
  body: (setTag: (tag: NfcTag) => void) => Promise<VerifiedWriteResult>,
): Promise<TagOperationResult> {
  const started = Date.now();
  let detected: NfcTag | undefined;
  try {
    const result = await body((tag) => {
      detected = tag;
    });
    await record(operation, started, detected, result, displayValue);
    return {
      success: result.success,
      tag: result.tag ?? detected,
      integrityPercent: result.verification?.integrityPercent,
      durationMs: Date.now() - started,
      error: result.error,
    };
  } catch (error) {
    const nfcError = toNfcError(error);
    await record(operation, started, detected, { success: false, error: nfcError }, displayValue);
    return { success: false, tag: detected, durationMs: Date.now() - started, error: nfcError };
  } finally {
    await nfcManager.cancelRequest().catch(() => undefined);
  }
}

/** Lê a tag de destino, recusa a própria origem, grava os records exatos e confere byte a byte. */
export function cloneFlow(input: { sourceRecords: NdefRecord[]; sourceUidHash?: string | null; summary: string }, onStep: StepHandler): Promise<TagOperationResult> {
  return run('clone', input.summary, async (setTag) => {
    onStep('wait');
    nfcManager.expectNewSimulatedTag();
    const target = await detect([NfcTech.Ndef], 'Aproxime a tag que receberá o conteúdo');
    setTag(target);
    if (input.sourceUidHash && target.uid && (await hashUid(target.uid)) === input.sourceUidHash) {
      throw new NfcError('VALIDATION_ERROR', 'Esta é a própria tag de origem. Aproxime outra tag para receber o conteúdo.');
    }
    onStep('write');
    const result = await nfcWriter.clone(input.sourceRecords, target, () => onStep('verify'));
    if (result.success) {
      onStep('done');
    }
    return result;
  });
}

export function lockFlow(input: { expectedUidHash: string | null; summary: string }, onStep: StepHandler): Promise<TagOperationResult> {
  return run('lock', input.summary, async (setTag) => {
    const unsupported = chipOperationUnsupportedReason('lock');
    if (unsupported) {
      throw new NfcError('OPERATION_NOT_SUPPORTED', unsupported);
    }
    if (!input.expectedUidHash) {
      throw new NfcError('TAG_MISMATCH', 'Sem o UID da tag da tela não dá para garantir que é a mesma tag. Leia a tag novamente.');
    }
    onStep('wait');
    const tag = await detect([NfcTech.Ndef], 'Aproxime a MESMA tag para travar');
    setTag(tag);
    onStep('check');
    await ensureSameTag(tag, input.expectedUidHash);
    onStep('write');
    const result = await nfcWriter.lockTag(tag, input.expectedUidHash);
    if (result.success) {
      onStep('verify');
      onStep('done');
    }
    return result;
  });
}

export function formatFlow(onStep: StepHandler): Promise<TagOperationResult> {
  return run('format', 'Formatar como NDEF', async (setTag) => {
    const unsupported = chipOperationUnsupportedReason('format');
    if (unsupported) {
      throw new NfcError('OPERATION_NOT_SUPPORTED', unsupported);
    }
    onStep('wait');
    const tag = await detect([NfcTech.NdefFormatable], 'Aproxime a tag para formatar');
    setTag(tag);
    onStep('write');
    const result = await nfcWriter.formatAsNdef(tag);
    if (result.success) {
      onStep('verify');
      onStep('done');
    }
    return result;
  });
}

export function eraseFlow(input: { expectedUidHash: string | null; summary: string }, onStep: StepHandler): Promise<TagOperationResult> {
  return run('erase', input.summary, async (setTag) => {
    onStep('wait');
    nfcManager.expectNewSimulatedTag();
    const tag = await detect([NfcTech.Ndef], 'Aproxime a tag para apagar');
    setTag(tag);
    onStep('check');
    await ensureSameTag(tag, input.expectedUidHash);
    onStep('write');
    const result = await nfcWriter.erase(tag);
    if (result.success) {
      onStep('verify');
      onStep('done');
    }
    return result;
  });
}
