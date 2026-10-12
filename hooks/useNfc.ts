import * as Haptics from 'expo-haptics';
import { Linking, Platform } from 'react-native';

import { diagnosticEngine } from '@/core/nfc/DiagnosticEngine';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { NfcError, VerificationFailedError } from '@/core/nfc/errors';
import { nfcManager } from '@/core/nfc/NfcManager';
import { nfcReader } from '@/core/nfc/NfcReader';
import { nfcWriter } from '@/core/nfc/NfcWriter';
import { tagAnalyzer } from '@/core/nfc/TagAnalyzer';
import { buildTechnicalSnapshot } from '@/core/nfc/technical';
import { writeFlow } from '@/core/nfc/writeFlow';
import { saveOperation, saveTag } from '@/core/offline/database';
import { useHaptics } from '@/hooks/useHaptics';
import { useNfcStore } from '@/stores/nfcStore';
import { useToastStore } from '@/stores/toastStore';
import type { NfcSimulationKind, NfcTag, ParsedRecord } from '@/types/nfc';

export function useNfc() {
  const isScanning = useNfcStore((state) => state.isScanning);
  const currentTag = useNfcStore((state) => state.currentTag);
  const writeSteps = useNfcStore((state) => state.writeSteps);
  const lastError = useNfcStore((state) => state.lastError);
  const isNfcEnabled = useNfcStore((state) => state.isNfcEnabled);
  const isNfcSupported = useNfcStore((state) => state.isNfcSupported);
  const haptics = useHaptics();

  async function checkNfcStatus() {
    const supported = await nfcManager.isSupported();
    const enabled = supported ? await nfcManager.isEnabled() : false;
    useNfcStore.getState().setNfcSupported(supported);
    useNfcStore.getState().setNfcEnabled(enabled);
    return { supported, enabled };
  }

  async function persistRead(tag: NfcTag, records: ParsedRecord[]) {
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
    return saveOperation({
      tagId,
      tagUid: tag.uid,
      tagType: tag.type,
      tagCapacity: tag.capacity,
      operation: 'READ',
      status: 'SUCCESS',
      contentType: records[0]?.contentType ?? null,
      payload: records[0]?.data ?? null,
      displayTitle: records[0]?.displayTitle ?? (tag.capabilities.supportsNdef ? 'Tag vazia' : 'Tag RFID'),
      displayValue: records[0]?.displayValue ?? tag.type,
      integrityPercent: 100,
      technical: buildTechnicalSnapshot(tag, Platform.OS, nfcManager.isSimulation()),
    });
  }

  async function startRead() {
    useNfcStore.getState().setScanning(true);
    useNfcStore.getState().setLastError(null);
    try {
      const result = await nfcReader.readTag();
      useNfcStore.getState().setCurrentTag(result.tag);
      haptics.notify(Haptics.NotificationFeedbackType.Success);
      return result;
    } catch (error) {
      const nfcError = error instanceof NfcError ? error : new NfcError('READ_FAILED');
      useNfcStore.getState().setLastError({ code: nfcError.code, message: nfcError.message });
      haptics.notify(Haptics.NotificationFeedbackType.Error);
      throw nfcError;
    } finally {
      useNfcStore.getState().setScanning(false);
    }
  }

  async function startWrite() {
    const payload = useNfcStore.getState().pendingPayload;
    const payloads = useNfcStore.getState().pendingPayloads;
    const options = useNfcStore.getState().writeOptions;
    if (!payload) {
      throw new NfcError('VALIDATION_ERROR');
    }
    useNfcStore.getState().resetWriteSteps();
    useNfcStore.getState().setScanning(true);
    try {
      const result = await writeFlow(payloads && payloads.length > 1 ? payloads : payload, (id, status) => useNfcStore.getState().setWriteStep(id, status), options);
      useNfcStore.getState().setLastQrValue(result.qrValue ?? null);
      haptics.notify(Haptics.NotificationFeedbackType.Success);
      return result;
    } catch (error) {
      const nfcError = error instanceof NfcError ? error : new NfcError('WRITE_FAILED');
      useNfcStore.getState().setLastError({
        code: nfcError.code,
        message: nfcError.message,
        expected: error instanceof VerificationFailedError ? error.expected : undefined,
        found: error instanceof VerificationFailedError ? error.found : undefined,
      });
      haptics.notify(Haptics.NotificationFeedbackType.Error);
      throw nfcError;
    } finally {
      useNfcStore.getState().setScanning(false);
    }
  }

  async function cancelOperation() {
    await nfcManager.cancelRequest();
    useNfcStore.getState().setScanning(false);
  }

  async function registerTagEvent(onTag: (tag: NfcTag, records: ParsedRecord[]) => void, onError?: (error: NfcError) => void, owner = 'screen') {
    useNfcStore.getState().setScanning(true);
    await nfcManager.registerTagEvent(
      (raw) => {
        const tag = tagAnalyzer.analyze(raw);
        const records = ndefEngine.parseContent(tag.ndefRecords);
        useNfcStore.getState().setCurrentTag(tag);
        haptics.impact(Haptics.ImpactFeedbackStyle.Heavy);
        onTag(tag, records);
      },
      (error) => {
        const nfcError = error instanceof NfcError ? error : new NfcError('READ_FAILED', error.message);
        onError?.(nfcError);
      },
      owner,
    );
  }

  async function unregisterTagEvent(owner = 'screen') {
    await nfcManager.unregisterTagEvent(owner);
    useNfcStore.getState().setScanning(false);
  }

  async function eraseTag(tag: NfcTag) {
    const result = await nfcWriter.erase(tag);
    await saveOperation({
      tagUid: tag.uid,
      tagType: tag.type,
      tagCapacity: tag.capacity,
      operation: 'ERASE',
      status: result.success ? 'SUCCESS' : 'FAILED',
      displayTitle: 'Apagar tag',
      displayValue: tag.type,
      errorMessage: result.error?.message,
      durationMs: result.duration,
    });
    if (result.success) {
      haptics.notify(Haptics.NotificationFeedbackType.Success);
    } else {
      haptics.notify(Haptics.NotificationFeedbackType.Error);
    }
    return result;
  }

  async function runDiagnostic(tag: NfcTag) {
    const report = diagnosticEngine.runDiagnostic(tag);
    await saveOperation({
      tagUid: tag.uid,
      tagType: tag.type,
      tagCapacity: tag.capacity,
      operation: 'DIAGNOSE',
      status: report.canBeUsed ? 'SUCCESS' : 'FAILED',
      displayTitle: 'Diagnóstico',
      displayValue: tag.type,
      technical: buildTechnicalSnapshot(tag, Platform.OS, nfcManager.isSimulation()),
    });
    return report;
  }

  async function openNfcSettings() {
    if (Platform.OS === 'web') {
      useToastStore.getState().show('As configurações de NFC não estão disponíveis neste ambiente.', 'warning');
      return;
    }
    const opened = await nfcManager.openSettings();
    if (!opened) {
      await Linking.openSettings();
    }
  }

  function simulateTag(kind: NfcSimulationKind = 'default') {
    if (__DEV__) {
      nfcManager.simulateTag(kind);
    }
  }

  return {
    isScanning,
    currentTag,
    writeSteps,
    lastError,
    isNfcEnabled,
    isNfcSupported,
    checkNfcStatus,
    startRead,
    startWrite,
    cancelOperation,
    eraseTag,
    runDiagnostic,
    registerTagEvent,
    unregisterTagEvent,
    persistRead,
    openNfcSettings,
    simulateTag: __DEV__ ? simulateTag : undefined,
    simulationAvailable: __DEV__ && nfcManager.isSimulation(),
  };
}
