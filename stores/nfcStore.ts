import { create } from 'zustand';

import type { NfcErrorCode } from '@/core/nfc/errors';
import type { NfcTag, WriteOptions, WritePayload, WriteStep, WriteStepId } from '@/types/nfc';
import { emptyWriteOptions } from '@/types/nfc';

export const DEFAULT_STEPS: WriteStep[] = [
  { id: 'prepare', label: 'Preparar conteúdo', status: 'pending' },
  { id: 'detect', label: 'Detectar', status: 'pending' },
  { id: 'write', label: 'Gravar', status: 'pending' },
  { id: 'reread', label: 'Reler', status: 'pending' },
  { id: 'interpret', label: 'Interpretar NDEF', status: 'pending' },
  { id: 'compare', label: 'Comparar', status: 'pending' },
  { id: 'confirm', label: 'Confirmar', status: 'pending' },
];

interface NfcState {
  isNfcEnabled: boolean;
  isNfcSupported: boolean;
  isScanning: boolean;
  currentTag: NfcTag | null;
  lastError: { code: NfcErrorCode; message: string; expected?: string; found?: string } | null;
  writeSteps: WriteStep[];
  pendingPayload: WritePayload | null;
  writeOptions: WriteOptions;
  lastQrValue: string | null;
  setNfcEnabled: (value: boolean) => void;
  setNfcSupported: (value: boolean) => void;
  setScanning: (value: boolean) => void;
  setCurrentTag: (tag: NfcTag | null) => void;
  setLastError: (error: { code: NfcErrorCode; message: string; expected?: string; found?: string } | null) => void;
  setWriteStep: (id: WriteStepId, status: WriteStep['status']) => void;
  resetWriteSteps: () => void;
  setPendingPayload: (payload: WritePayload | null) => void;
  setWriteOptions: (options: Partial<WriteOptions>) => void;
  setLastQrValue: (value: string | null) => void;
}

export const useNfcStore = create<NfcState>((set) => ({
  isNfcEnabled: false,
  isNfcSupported: false,
  isScanning: false,
  currentTag: null,
  lastError: null,
  writeSteps: DEFAULT_STEPS.map((step) => ({ ...step })),
  pendingPayload: null,
  writeOptions: { ...emptyWriteOptions },
  lastQrValue: null,
  setNfcEnabled: (isNfcEnabled) => set({ isNfcEnabled }),
  setNfcSupported: (isNfcSupported) => set({ isNfcSupported }),
  setScanning: (isScanning) => set({ isScanning }),
  setCurrentTag: (currentTag) => set({ currentTag }),
  setLastError: (lastError) => set({ lastError }),
  setWriteStep: (id, status) =>
    set((state) => ({
      writeSteps: state.writeSteps.map((step) => (step.id === id ? { ...step, status } : step)),
    })),
  resetWriteSteps: () => set({ writeSteps: DEFAULT_STEPS.map((step) => ({ ...step })), lastError: null }),
  setPendingPayload: (pendingPayload) => set({ pendingPayload }),
  setWriteOptions: (options) => set((state) => ({ writeOptions: { ...state.writeOptions, ...options } })),
  setLastQrValue: (lastQrValue) => set({ lastQrValue }),
}));
