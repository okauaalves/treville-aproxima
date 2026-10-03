import { Ndef, NfcTech } from '@/core/nfc/nfcNative';
import { NfcError, toNfcError } from '@/core/nfc/errors';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { nfcManager } from '@/core/nfc/NfcManager';
import { nfcReader } from '@/core/nfc/NfcReader';
import type { NfcTag, WritePayload } from '@/types/nfc';

export interface HardwareWriteResult {
  success: boolean;
  bytesWritten: number;
  duration: number;
  error?: NfcError;
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

export class NfcWriter {
  private validateBeforeWrite(payload: WritePayload, tag: NfcTag): number[] {
    if (!tag.capabilities.supportsNdef) {
      throw new NfcError('NDEF_NOT_SUPPORTED');
    }
    if (!tag.capabilities.canWrite) {
      throw new NfcError('TAG_LOCKED');
    }
    const records = ndefEngine.buildMessage(payload);
    const size = ndefEngine.calculateMessageSize(records);
    if (size > tag.availableSpace && size > tag.capacity) {
      throw new NfcError('INSUFFICIENT_SPACE');
    }
    if (tag.availableSpace >= 0 && tag.capacity > 0 && size > tag.capacity) {
      throw new NfcError('INSUFFICIENT_SPACE');
    }
    return Ndef.encodeMessage(records);
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
        await nfcManager.requestTechnology([NfcTech.Ndef]);
      }
      await nfcManager.writeNdef(bytes);
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  async erase(tag: NfcTag): Promise<HardwareWriteResult> {
    const started = Date.now();
    try {
      if (!tag.capabilities.canWrite) {
        throw new NfcError('TAG_LOCKED');
      }
      const empty = Ndef.record(Ndef.TNF_EMPTY, '', [], []);
      const bytes = Ndef.encodeMessage([empty]);
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnology([NfcTech.Ndef]);
      }
      await nfcManager.writeNdef(bytes);
      await nfcManager.cancelRequest();
      const reread = await nfcReader.readRaw();
      const meaningful = reread.records.filter((record) => record.rawValue.trim().length > 0);
      if (meaningful.length > 0) {
        throw new NfcError('VERIFICATION_FAILED');
      }
      return { success: true, bytesWritten: bytes.length, duration: Date.now() - started };
    } catch (error) {
      return { success: false, bytesWritten: 0, duration: Date.now() - started, error: mapWriteError(error) };
    } finally {
      await nfcManager.cancelRequest();
    }
  }
}

export const nfcWriter = new NfcWriter();
