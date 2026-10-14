import { saveOperation, saveTag } from '@/core/offline/database';
import { NfcError, toNfcError } from '@/core/nfc/errors';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { NfcTech } from '@/core/nfc/nfcNative';
import { nfcManager } from '@/core/nfc/NfcManager';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import type { NfcTag, RawReadResult, ReadResult } from '@/types/nfc';

async function persistRead(tag: NfcTag, records: ReadResult['records']): Promise<string | undefined> {
  try {
    const tagId = tag.uid
      ? await saveTag({
          uid: tag.uid,
          type: tag.type,
          capacity: tag.capacity,
          technologies: tag.technologies,
          isWritable: tag.capabilities.canWrite,
          isLocked: tag.capabilities.isReadOnly,
        })
      : null;
    return await saveOperation({
      tagId,
      operation: 'READ',
      status: 'SUCCESS',
      contentType: records[0]?.contentType ?? null,
      payload: records[0]?.data ?? null,
      integrityPercent: 100,
    });
  } catch {
    return undefined;
  }
}

export class NfcReader {
  /**
   * Se o writeFlow deixou a sessão Ndef aberta, readRaw reutiliza getTag.
   * Se a sessão já foi encerrada pelo writer, abre uma sessão nova e fecha só a que ele abriu.
   */
  async readRaw(): Promise<RawReadResult> {
    const openedHere = !nfcManager.isSessionOpen();
    try {
      if (openedHere) {
        await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      }
      const raw = await nfcManager.getTag();
      if (!raw) {
        throw new NfcError('READ_FAILED');
      }
      const tag = tagAnalyzer.analyze(raw);
      const records = ndefEngine.parseContent(tag.ndefRecords);
      return { tag, rawMessage: tag.ndefRecords, records };
    } catch (error) {
      throw error instanceof NfcError ? error : toNfcError(error);
    } finally {
      if (openedHere) {
        await nfcManager.cancelRequest();
      }
    }
  }

  async readTag(): Promise<ReadResult> {
    try {
      await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
      const raw = await nfcManager.getTag();
      if (!raw) {
        throw new NfcError('READ_FAILED');
      }
      const tag = tagAnalyzer.analyze(raw);
      const records = ndefEngine.parseContent(tag.ndefRecords);
      const operationId = await persistRead(tag, records);
      return { tag, records, rawMessage: tag.ndefRecords, success: true, operationId };
    } catch (error) {
      if (error instanceof NfcError) {
        throw error.code === 'WRITE_FAILED' ? new NfcError('READ_FAILED', error.message) : error;
      }
      if (error instanceof Error) {
        throw toNfcError(error);
      }
      throw new NfcError('READ_FAILED');
    } finally {
      await nfcManager.cancelRequest();
    }
  }

  /** Mantém a sessão Ndef aberta para o NfcWriter reutilizar. O writer fecha no finally. */
  async waitForTag(): Promise<NfcTag> {
    if (!nfcManager.isSessionOpen()) {
      await nfcManager.requestTechnologyWithTimeout([NfcTech.Ndef]);
    }
    const raw = await nfcManager.getTag();
    if (!raw) {
      throw new NfcError('READ_FAILED');
    }
    return tagAnalyzer.analyze(raw);
  }
}

export const nfcReader = new NfcReader();
