import { Platform } from 'react-native';
import type { NdefRecord } from 'react-native-nfc-manager';

import { Ndef, NfcTech } from '@/core/nfc/nfcNative';
import { NfcError, toNfcError } from '@/core/nfc/errors';
import { encodeRecords, ndefEngine, ndefMessageSize, normalizeRecord } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { nfcReader } from '@/core/nfc/NfcReader';
import { verificationEngine } from '@/core/nfc/VerificationEngine';
import { hashUid } from '@/core/offline/database';
import type { NfcTag, VerificationResult, WritePayload } from '@/types/nfc';

export interface HardwareWriteResult {
  success: boolean;
  bytesWritten: number;
  duration: number;
  error?: NfcError;
}

export interface VerifiedWriteResult extends HardwareWriteResult {
  /** Tag relida depois da operação (fonte da verdade para o estado final). */
  tag?: NfcTag;
  verification?: VerificationResult;
}

function mapWriteError(error: unknown): NfcError {
  if (error instanceof NfcError) {
    return error;
  }
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  if (lower.includes('cancel')) {
    return new NfcError('USER_CANCELLED');
  }
  if (lower.includes('readonly') || lower.includes('read only') || lower.includes('not writable')) {
    return new NfcError('TAG_LOCKED');
  }
  if (lower.includes('tag was lost') || lower.includes('tag lost')) {
    return new NfcError('TAG_MOVED');
  }
  if (lower.includes('ioexception') || lower.includes('transceive')) {
    return new NfcError('CONNECTION_LOST');
  }
  return toNfcError(error);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Mensagem honesta por plataforma para lock/format (só Android nativo executa). */
export function chipOperationUnsupportedReason(operation: 'lock' | 'format', platform: string = Platform.OS, simulated = nfcManager.isSimulation()): string | null {
  const name = operation === 'lock' ? 'Travar a tag' : 'Formatar como NDEF';
  if (simulated) {
    return `${name} fica desativado no modo de teste: a simulação nunca executa operações irreversíveis.`;
  }
  if (platform === 'ios') {
    return operation === 'lock'
      ? `${name} não está disponível no iPhone neste app. Use um aparelho Android.`
      : `${name} não é suportado pelo iPhone: o iOS não expõe a formatação de tags.`;
  }
  if (platform === 'web') {
    return `${name} não é suportado pelo navegador: o Web NFC só lê e grava NDEF.`;
  }
  if (nfcManager.getMode() !== 'native') {
    return `${name} exige o app instalado (build de desenvolvimento ou produção), não o Expo Go.`;
  }
  return null;
}

export class NfcWriter {
  private ensureWritable(tag: NfcTag, size: number): void {
    if (!tag.capabilities.supportsNdef) {
      throw new NfcError('NDEF_NOT_SUPPORTED');
    }
    if (!tag.capabilities.canWrite) {
      throw new NfcError('TAG_LOCKED');
    }
    if (tag.capacity > 0 && size > tag.capacity) {
      throw new NfcError('INSUFFICIENT_SPACE', `O conteúdo precisa de ${size} bytes e a tag comporta ${tag.capacity}.`);
    }
  }

  private validateBeforeWrite(payload: WritePayload, tag: NfcTag): number[] {
    const records = ndefEngine.buildMessage(payload);
    this.ensureWritable(tag, ndefEngine.calculateMessageSize(records));
    return encodeRecords(records);
  }

  /**
   * Se o passo detect já abriu NfcTech.Ndef, a gravação reutiliza a sessão.
   * O finally sempre cancela, para o reread abrir uma sessão nova.
   */
  async write(payload: WritePayload, tag: NfcTag): Promise<HardwareWriteResult> {
    const started = Date.now();
    try {
      const bytes = this.validateBeforeWrite(payload, tag);
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      }
      await nfcManager.writeNdef(bytes);
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  /** Grava records prontos (TNF/type/id/payload exatos). Mesmo contrato de sessão do write. */
  async writeRecords(records: NdefRecord[], tag: NfcTag): Promise<HardwareWriteResult> {
    const started = Date.now();
    try {
      if (records.length === 0) {
        throw new NfcError('VALIDATION_ERROR', 'Nenhum registro para gravar.');
      }
      this.ensureWritable(tag, ndefMessageSize(records));
      const bytes = encodeRecords(records);
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      }
      await nfcManager.writeNdef(bytes);
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  /**
   * Copia o conteúdo NDEF (records exatos) para `targetTag` e só conclui depois de reler e comparar
   * byte a byte. Não copia UID, senhas nem o chip: só a mensagem NDEF.
   */
  async clone(sourceRecords: NdefRecord[], targetTag: NfcTag, onVerify?: () => void): Promise<VerifiedWriteResult> {
    const started = Date.now();
    try {
      if (sourceRecords.length === 0) {
        throw new NfcError('VALIDATION_ERROR', 'A tag de origem não tem conteúdo NDEF para clonar.');
      }
      const records = sourceRecords.map(normalizeRecord) as NdefRecord[];
      const written = await this.writeRecords(records, targetTag);
      if (!written.success) {
        throw written.error ?? new NfcError('WRITE_FAILED');
      }
      onVerify?.();
      await pause(300);
      const reread = await nfcReader.readRaw();
      const verification = verificationEngine.verifyRecords(records, reread.rawMessage);
      return {
        success: verification.passed,
        bytesWritten: written.bytesWritten,
        duration: Date.now() - started,
        tag: reread.tag,
        verification,
        error: verification.passed ? undefined : new NfcError('VERIFICATION_FAILED', `Integridade: ${verification.integrityPercent}%`),
      };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  /**
   * Torna a tag somente leitura PARA SEMPRE. Exige a mesma tag da tela (hash do UID) e confirma
   * relendo que ela deixou de ser gravável. Só Android nativo; nunca na simulação.
   */
  async lockTag(tag: NfcTag, expectedUidHash?: string | null): Promise<VerifiedWriteResult> {
    const started = Date.now();
    try {
      const unsupported = chipOperationUnsupportedReason('lock');
      if (unsupported) {
        throw new NfcError('OPERATION_NOT_SUPPORTED', unsupported);
      }
      if (tag.capabilities.platformLimited) {
        throw new NfcError('OPERATION_NOT_SUPPORTED', 'Travar a tag só é possível no Android.');
      }
      if (!tag.capabilities.supportsNdef) {
        throw new NfcError('NDEF_NOT_SUPPORTED');
      }
      if (!tag.capabilities.canWrite) {
        throw new NfcError('TAG_LOCKED', 'Esta tag já está em modo somente leitura.');
      }
      if (!tag.capabilities.canLock) {
        throw new NfcError('OPERATION_NOT_SUPPORTED', 'Este chip não permite travamento pelo Android.');
      }
      if (expectedUidHash) {
        const hash = tag.uid ? await hashUid(tag.uid) : '';
        if (hash !== expectedUidHash) {
          throw new NfcError('TAG_MISMATCH');
        }
      }
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      }
      const locked = await nfcManager.makeReadOnly();
      if (!locked) {
        throw new NfcError('LOCK_FAILED');
      }
      await nfcManager.cancelRequest();
      await pause(300);
      const reread = await nfcReader.readRaw();
      if (reread.tag.capabilities.canWrite) {
        throw new NfcError('LOCK_FAILED', 'A tag ainda aparece como gravável depois do travamento.');
      }
      return { success: true, bytesWritten: 0, duration: Date.now() - started, tag: reread.tag };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  /**
   * NdefFormatable.format() com uma mensagem vazia e releitura para reavaliar as capacidades.
   * Só Android nativo. Em alguns chips a formatação não pode ser desfeita.
   */
  async formatAsNdef(tag?: NfcTag | null): Promise<VerifiedWriteResult> {
    const started = Date.now();
    try {
      const unsupported = chipOperationUnsupportedReason('format');
      if (unsupported) {
        throw new NfcError('OPERATION_NOT_SUPPORTED', unsupported);
      }
      if (tag?.capabilities.supportsNdef) {
        throw new NfcError('VALIDATION_ERROR', 'Esta tag já está no formato NDEF.');
      }
      if (tag && !tag.capabilities.canFormat) {
        throw new NfcError('OPERATION_NOT_SUPPORTED', 'Este chip não aceita formatação NDEF pelo Android.');
      }
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.NdefFormatable], undefined, { alertMessage: 'Aproxime a tag para formatar' });
      }
      const bytes = encodeRecords([Ndef.record(Ndef.TNF_EMPTY, '', [], [])]);
      await nfcManager.formatNdef(bytes);
      await nfcManager.cancelRequest();
      await pause(300);
      const reread = await nfcReader.readRaw();
      if (!reread.tag.capabilities.supportsNdef) {
        throw new NfcError('FORMAT_FAILED', 'A tag não passou a responder como NDEF.');
      }
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started, tag: reread.tag };
    } catch (error) {
      const mapped = mapWriteError(error);
      return {
        success: false,
        bytesWritten: 0,
        duration: Date.now() - started,
        error: mapped.code === 'WRITE_FAILED' ? new NfcError('FORMAT_FAILED', mapped.message) : mapped,
      };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  async erase(tag: NfcTag): Promise<VerifiedWriteResult> {
    const started = Date.now();
    try {
      if (!tag.capabilities.supportsNdef) {
        throw new NfcError('NDEF_NOT_SUPPORTED');
      }
      if (!tag.capabilities.canWrite) {
        throw new NfcError('TAG_LOCKED');
      }
      const empty = Ndef.record(Ndef.TNF_EMPTY, '', [], []);
      const bytes = encodeRecords([empty]);
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      }
      await nfcManager.writeNdef(bytes);
      await nfcManager.cancelRequest();
      const reread = await nfcReader.readRaw();
      const meaningful = reread.records.filter((record) => record.rawValue.trim().length > 0);
      if (meaningful.length > 0) {
        throw new NfcError('VERIFICATION_FAILED', 'A tag ainda tem conteúdo depois de apagar.');
      }
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started, tag: reread.tag };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }
}

export const nfcWriter = new NfcWriter();
