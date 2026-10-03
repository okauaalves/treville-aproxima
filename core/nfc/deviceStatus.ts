import { Platform } from 'react-native';

import { nfcManager } from '@/core/nfc/NfcManager';
import { isWebNfcSupported, webNfcUnavailableReason } from '@/core/nfc/webNfc';
import { getNfcPermissionState } from '@/core/platform/permissions';

export interface DeviceCheck {
  id: string;
  label: string;
  ok: boolean;
  reason: string;
  solution: string;
}

export async function deviceChecks(): Promise<DeviceCheck[]> {
  const mode = nfcManager.getMode();
  const supported = await nfcManager.isSupported();
  const enabled = supported ? await nfcManager.isEnabled() : false;
  const permission = getNfcPermissionState();
  const secure = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.isSecureContext === true);
  const web = Platform.OS === 'web';
  const simulated = mode === 'simulated';
  const available = mode !== 'unavailable';

  return [
    {
      id: 'available',
      label: 'NFC disponível',
      ok: available && supported,
      reason: available ? (simulated ? 'Modo de teste neste navegador.' : 'O adaptador NFC respondeu.') : webNfcUnavailableReason(),
      solution: available ? 'Nenhuma ação necessária.' : 'Use um Android com NFC ou o Chrome no Android em HTTPS.',
    },
    {
      id: 'enabled',
      label: 'NFC ligado',
      ok: enabled,
      reason: enabled ? 'A leitura está liberada.' : 'O rádio NFC está desligado ou ausente.',
      solution: enabled ? 'Nenhuma ação necessária.' : 'Ative o NFC nas configurações do aparelho.',
    },
    {
      id: 'permission',
      label: 'Permissão',
      ok: permission.granted,
      reason: permission.message,
      solution: permission.granted ? 'Nenhuma ação necessária.' : 'Conceda o acesso ao NFC quando o sistema pedir.',
    },
    {
      id: 'browser',
      label: 'Navegador / Web NFC',
      ok: !web || isWebNfcSupported() || simulated,
      reason: !web ? 'App nativo, sem Web NFC.' : isWebNfcSupported() ? 'NDEFReader disponível.' : simulated ? 'Modo de teste: este navegador não tem Web NFC.' : webNfcUnavailableReason(),
      solution: !web || isWebNfcSupported() ? 'Nenhuma ação necessária.' : 'Abra no Chrome para Android, em HTTPS.',
    },
    {
      id: 'secure',
      label: 'Contexto seguro',
      ok: secure,
      reason: secure ? 'A página está em contexto seguro.' : 'Web NFC exige HTTPS ou localhost.',
      solution: secure ? 'Nenhuma ação necessária.' : 'Sirva o app em HTTPS.',
    },
    {
      id: 'read',
      label: 'Leitura disponível',
      ok: available,
      reason: available ? (simulated ? 'Leitura simulada no modo de teste.' : 'A leitura NDEF está disponível.') : 'Não há adaptador de leitura.',
      solution: available ? 'Aproxime uma tag.' : 'Troque de aparelho ou navegador.',
    },
    {
      id: 'write',
      label: 'Gravação disponível',
      ok: available && (mode !== 'web' || isWebNfcSupported() || simulated),
      reason: mode === 'native' && Platform.OS === 'ios' ? 'O iPhone grava NDEF na sessão iniciada pelo usuário.' : available ? 'A gravação NDEF está disponível.' : 'Não há adaptador de gravação.',
      solution: available ? 'Mantenha a tag encostada até a confirmação.' : 'Use Android com NFC ou Chrome no Android.',
    },
  ];
}
