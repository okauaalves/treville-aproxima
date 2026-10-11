import { NfcTech } from '@/core/nfc/nfcNative';
import { NfcError, ValidationError, VerificationFailedError } from '@/core/nfc/errors';
import { nfcManager } from '@/core/nfc/NfcManager';
import { nfcReader } from '@/core/nfc/NfcReader';
import { nfcWriter } from '@/core/nfc/NfcWriter';
import { verificationEngine } from '@/core/nfc/VerificationEngine';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { platformCapabilities } from '@/core/platform/capabilities';
import { payloadValidator } from '@/core/validation/payloadValidator';
import { initDatabase, saveOperation, saveTag, saveTemplate } from '@/core/offline/database';
import { useSettingsStore } from '@/stores/settingsStore';
import { CONTENT_TYPE_META } from '@/constants/nfcTypes';
import { buildQrValue } from '@/utils/qrcode';
import type { NfcTag, StepStatus, WriteFlowResult, WriteOptions, WritePayload, WriteStepId } from '@/types/nfc';
import { emptyWriteOptions } from '@/types/nfc';

const WRITE_ALERT = 'Mantenha o app aberto e aproxime a tag para gravar';

function pause(ms: number): Promise<void> {
  if (useSettingsStore.getState().reduceAnimations || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function payloadText(payload: WritePayload): { title: string; value: string } {
  const title = CONTENT_TYPE_META[payload.contentType].name;
  const value =
    payload.url ??
    payload.appUri ??
    payload.phone ??
    payload.email ??
    payload.fullName ??
    payload.ssid ??
    payload.cardTitle ??
    payload.text ??
    payload.eventTitle ??
    payload.address ??
    title;
  return { title, value };
}

/**
 * Detect abre a sessão NDEF e deixa aberta. O writer reutiliza e fecha no finally.
 * A releitura abre outra sessão. O compare usa esses records, sem segunda leitura.
 */
export async function writeFlow(
  payload: WritePayload,
  onStep: (id: WriteStepId, status: StepStatus) => void,
  options: WriteOptions = emptyWriteOptions,
): Promise<WriteFlowResult> {
  let tag: NfcTag | null = null;
  let current: WriteStepId = 'prepare';
  let saved = false;
  const started = Date.now();
  const label = payloadText(payload);

  try {
    current = 'prepare';
    onStep('prepare', 'active');
    await initDatabase();
    const validation = payloadValidator.validate(payload);
    if (!validation.ok) {
      throw new ValidationError(validation.error, validation.errorField);
    }
    await pause(300);
    onStep('prepare', 'success');

    current = 'detect';
    onStep('detect', 'active');
    await nfcManager.requestTechnology([NfcTech.Ndef], { alertMessage: WRITE_ALERT });
    const rawTag = await nfcManager.getTag();
    if (!rawTag) {
      throw new NfcError('READ_FAILED', 'Tag não encontrada');
    }
    tag = tagAnalyzer.analyze(rawTag);
    onStep('detect', 'success');

    current = 'write';
    onStep('write', 'active');
    const written = await nfcWriter.write(payload, tag);
    if (!written.success || written.error) {
      throw written.error ?? new NfcError('WRITE_FAILED');
    }
    onStep('write', 'success');

    current = 'reread';
    onStep('reread', 'active');
    await pause(400);
    const reread = await nfcReader.readRaw();
    onStep('reread', 'success');

    current = 'interpret';
    onStep('interpret', 'active');
    await pause(200);
    const interpreted = reread.records;
    onStep('interpret', 'success');

    current = 'compare';
    onStep('compare', 'active');
    const verification = await verificationEngine.verify(payload, interpreted);
    onStep('compare', 'success');

    current = 'confirm';
    onStep('confirm', 'active');
    await pause(300);
    if (!verification.passed) {
      onStep('confirm', 'error');
      const expected = label.value;
      const found = verification.readAfterWrite.map((record) => record.displayValue).filter(Boolean).join(' · ') || 'Nenhum registro';
      throw new VerificationFailedError(`Integridade: ${verification.integrityPercent}%`, expected, found);
    }

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
    const operationId = await saveOperation({
      tagId,
      tagUid: tag.uid,
      tagType: tag.type,
      tagCapacity: tag.capacity,
      operation: 'WRITE',
      status: 'SUCCESS',
      contentType: payload.contentType,
      payload,
      displayTitle: label.title,
      displayValue: label.value,
      integrityPercent: verification.integrityPercent,
      durationMs: Date.now() - started,
    });
    saved = true;

    if (options.lockAfterWrite && platformCapabilities.canLockTag && tag.capabilities.canLock) {
      if (!nfcManager.isSessionOpen()) {
        await nfcManager.requestTechnology([NfcTech.Ndef], { alertMessage: WRITE_ALERT });
      }
      await nfcManager.makeReadOnly();
    }
    if (options.saveAsTemplate && options.templateName.trim().length > 0) {
      await saveTemplate({
        name: options.templateName.trim(),
        type: payload.contentType,
        icon: payload.cardIcon ?? null,
        color: payload.cardColor ?? null,
        configuration: payload,
      });
    }

    onStep('confirm', 'success');
    return {
      success: true,
      tag,
      integrityPercent: verification.integrityPercent,
      operationId,
      qrValue: options.generateQr ? buildQrValue(payload) : null,
    };
  } catch (error) {
    onStep(current, 'error');
    const nfcError = error instanceof NfcError ? error : new NfcError('WRITE_FAILED');
    if (!saved) {
      await saveOperation({
        tagUid: tag?.uid,
        tagType: tag?.type ?? null,
        tagCapacity: tag?.capacity ?? null,
        operation: 'WRITE',
        status: 'FAILED',
        contentType: payload.contentType,
        payload,
        displayTitle: label.title,
        displayValue: label.value,
        errorMessage: nfcError.message,
        durationMs: Date.now() - started,
      }).catch(() => undefined);
    }
    throw nfcError;
  } finally {
    await nfcManager.cancelRequest().catch(() => undefined);
  }
}
